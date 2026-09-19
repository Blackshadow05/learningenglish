import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function cargar(ruta) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(ruta, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, require: ruta => {
    if (ruta === "@google/genai") return {
      Modality: { AUDIO: "AUDIO" }, ActivityHandling: { START_OF_ACTIVITY_INTERRUPTS: "START_OF_ACTIVITY_INTERRUPTS" },
      StartSensitivity: { START_SENSITIVITY_LOW: "START_SENSITIVITY_LOW" }, EndSensitivity: { END_SENSITIVITY_LOW: "END_SENSITIVITY_LOW" },
    };
    throw new Error(`Unexpected runtime import ${ruta}`);
  } });
  return exports;
}
const configuracion = cargar(new URL("../lib/practice-config.ts", import.meta.url));
const revision = cargar(new URL("../lib/practice-review.ts", import.meta.url));

// Run the actual controller with deterministic microphone, transport and audio devices.
// No API requests, microphone access or new test dependencies are needed.
const codigo = ts.transpileModule(readFileSync(new URL("../components/learning/live-session.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function pendiente() {
  let resolver;
  const promesa = new Promise(resolve => { resolver = resolve; });
  return { promesa, resolver };
}
async function hasta(condicion) {
  for (let i = 0; i < 30 && !condicion(); i++) await Promise.resolve();
  assert.ok(condicion(), "The expected asynchronous step should have been reached");
}

function entorno(opciones = {}) {
  const contextos = [], capturas = [], sesiones = [], temporizadores = new Map();
  let permisos = 0, tokens = 0, reloj = 10000, timerId = 0, solicitud, preferencias, worklet;
  const pista = { enabled: true, stopped: false, onended: null, stop() { this.stopped = true; } };
  const flujo = { getTracks: () => [pista], getAudioTracks: () => [pista] };
  class Contexto {
    constructor({ sampleRate }) {
      this.sampleRate = sampleRate;
      this.currentTime = 10;
      this.state = "running";
      this.destination = {};
      this.sources = [];
      this.audioWorklet = { addModule: async () => { if (opciones.workletError) throw new Error("worklet"); } };
      contextos.push(this);
    }
    resume() { return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData(data) { data.fill(0); } }; }
    createBuffer(channels, length, sampleRate) { return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      const source = { onended: null, stopped: false, connect() {}, disconnect() {}, start(time) { this.startTime = time; }, stop() { this.stopped = true; } };
      this.sources.push(source);
      return source;
    }
  }
  class Captura {
    constructor() { this.port = { onmessage: null, close() {}, postMessage() { if (!opciones.flushPendiente) this.onmessage?.({ data: "flushed" }); } }; capturas.push(this); }
    connect() {}
    disconnect() {}
  }
  const exports = {};
  runInNewContext(codigo, {
    exports, Error, Float32Array, Uint8Array, DataView, btoa, atob, Blob,
    require: nombre => nombre.endsWith("practice-config") ? configuracion : revision,
    AudioContext: Contexto, AudioWorkletNode: Captura,
    navigator: { mediaDevices: { getUserMedia: async () => {
      permisos++;
      if (opciones.permisoError) throw opciones.permisoError;
      return opciones.microfonoPendiente?.promesa ?? flujo;
    } } },
    URL: { createObjectURL: blob => { worklet = blob; return "blob:test"; }, revokeObjectURL() {} },
    performance: { now: () => reloj },
    setTimeout: callback => { temporizadores.set(++timerId, callback); return timerId; },
    clearTimeout: id => temporizadores.delete(id),
    setInterval: () => 1, clearInterval() {},
  });
  const controller = new exports.ConversacionLive({
    crearToken: async args => {
      solicitud = args;
      tokens++;
      return opciones.tokenPendiente?.promesa ?? { token: "test", modelo: "test", voz: "test", instruccion: "test" };
    },
    conectar: async (_, callbacks, config) => {
      preferencias = config;
      const sesion = {
        callbacks, inputs: [], turns: [], tools: [], closed: false,
        sendRealtimeInput(input) { if (opciones.sendError) throw new Error("closed"); this.inputs.push(input); },
        sendClientContent(turn) { this.turns.push(turn); },
        sendToolResponse(tool) { this.tools.push(tool); },
        close() { this.closed = true; callbacks.onclose?.({}); },
      };
      sesiones.push(sesion);
      return opciones.conexionPendiente ? opciones.conexionPendiente.promesa.then(() => sesion) : sesion;
    },
  });
  return {
    controller, pista, flujo, contextos, capturas, sesiones, temporizadores,
    get permisos() { return permisos; }, get tokens() { return tokens; },
    get solicitud() { return solicitud; }, get preferencias() { return preferencias; }, get worklet() { return worklet; },
    iniciar: config => controller.iniciar("llegada_huesped", "A1", config),
    recibir: content => sesiones.at(-1).callbacks.onmessage({ serverContent: content }),
    tool: (name, args) => sesiones.at(-1).callbacks.onmessage({ toolCall: { functionCalls: [{ id: "call1", name, args }] } }),
    audio: () => capturas.at(-1).port.onmessage?.({ data: new Float32Array([.1, -.1, .2, -.2]) }),
    avanzar: ms => { reloj += ms; },
    codificarPcm: exports.codificarPcm,
  };
}

const audio = { modelTurn: { parts: [{ inlineData: { data: btoa("\0\0\0\0"), mimeType: "audio/pcm;rate=24000" } }] } };

test("PCM clips peaks and encodes signed 16-bit little-endian samples", () => {
  const { codificarPcm } = entorno();
  const bytes = Buffer.from(codificarPcm(new Float32Array([-2, -1, 0, 1, 2])), "base64");
  assert.deepEqual([0, 2, 4, 6, 8].map(i => bytes.readInt16LE(i)), [-32768, -32768, 0, 32767, 32767]);
});

test("connects once, greets automatically and streams microphone audio", async () => {
  const e = entorno();
  await Promise.all([e.iniciar(), e.iniciar()]);
  assert.equal(e.permisos, 1);
  assert.equal(e.tokens, 1);
  assert.equal(e.controller.getSnapshot().estado, "en_vivo");
  assert.equal(e.sesiones[0].turns.length, 1);
  assert.equal(e.controller.getSnapshot().mensajes.length, 0, "The internal greeting prompt is not shown as user speech");
  e.audio();
  assert.equal(e.sesiones[0].inputs[0].audio.mimeType, "audio/pcm;rate=16000");
  e.controller.finalizar();
  assert.ok(e.pista.stopped);
  assert.ok(e.sesiones[0].closed);
  assert.equal(e.contextos[0].state, "closed");
  assert.equal(e.contextos[1].state, "closed");
  assert.equal(e.contextos[1].sampleRate, 24000, "Playback retains the tutor's audio quality");
});

test("muting disables the track and upload, flushes input, and can resume", async () => {
  const e = entorno(); await e.iniciar();
  e.controller.silenciar(true);
  assert.equal(e.pista.enabled, false);
  assert.equal(e.sesiones[0].inputs[0].audioStreamEnd, true);
  e.audio();
  assert.equal(e.sesiones[0].inputs.length, 1);
  e.controller.silenciar(false); e.audio();
  assert.equal(e.pista.enabled, true);
  assert.equal(e.sesiones[0].inputs.length, 2);
  e.controller.finalizar();
});

test("speaking lasts until all queued playback ends, even after turnComplete", async () => {
  const e = entorno(); await e.iniciar();
  e.recibir(audio); e.recibir(audio); e.recibir({ turnComplete: true });
  const [primera, segunda] = e.contextos[1].sources;
  assert.ok(segunda.startTime > primera.startTime);
  assert.equal(e.controller.getSnapshot().tutorHablando, true);
  primera.onended();
  assert.equal(e.controller.getSnapshot().tutorHablando, true);
  segunda.onended();
  assert.equal(e.controller.getSnapshot().tutorHablando, false);
  e.controller.finalizar();
});

test("an interruption drops all queued audio and the next reply can play", async () => {
  const e = entorno(); await e.iniciar();
  e.recibir(audio); e.recibir(audio); e.recibir({ interrupted: true });
  assert.ok(e.contextos[1].sources.every(source => source.stopped));
  assert.equal(e.controller.getSnapshot().tutorHablando, false);
  e.recibir(audio);
  assert.equal(e.controller.getSnapshot().tutorHablando, true);
  e.controller.finalizar();
});

test("cancel while permission is pending stops a late microphone and never requests a token", async () => {
  const gate = pendiente(), e = entorno({ microfonoPendiente: gate });
  const inicio = e.iniciar(); e.controller.finalizar();
  gate.resolver(e.flujo); await inicio;
  assert.ok(e.pista.stopped);
  assert.equal(e.tokens, 0);
  assert.equal(e.contextos[0].state, "closed");
  assert.equal(e.controller.getSnapshot().estado, "finalizada");
});

test("cancel while the token is pending never opens a late WebSocket", async () => {
  const gate = pendiente(), e = entorno({ tokenPendiente: gate });
  const inicio = e.iniciar(); await hasta(() => e.tokens === 1);
  e.controller.finalizar(); gate.resolver({ token: "test" }); await inicio;
  assert.equal(e.sesiones.length, 0);
  assert.ok(e.pista.stopped);
});

test("a late connection is closed and cannot reactivate a cancelled session", async () => {
  const gate = pendiente(), e = entorno({ conexionPendiente: gate });
  const inicio = e.iniciar(); await hasta(() => e.sesiones.length === 1);
  e.controller.finalizar(); gate.resolver(); await inicio;
  assert.ok(e.sesiones[0].closed);
  assert.equal(e.sesiones[0].turns.length, 0);
  assert.equal(e.controller.getSnapshot().estado, "finalizada");
});

test("errors release microphone and playback, survive onclose, and allow retry", async () => {
  const e = entorno(); await e.iniciar(); e.recibir(audio);
  e.sesiones[0].callbacks.onerror({});
  assert.equal(e.controller.getSnapshot().estado, "error");
  assert.ok(e.pista.stopped);
  assert.equal(e.contextos[0].state, "closed");
  assert.ok(e.contextos[1].sources[0].stopped);
  await e.iniciar();
  e.sesiones[0].callbacks.onclose({});
  e.sesiones[0].callbacks.onmessage({ serverContent: { outputTranscription: { text: "stale" } } });
  assert.equal(e.controller.getSnapshot().estado, "en_vivo");
  assert.equal(e.controller.getSnapshot().mensajes.length, 0);
  e.controller.finalizar();
});

test("denied permission gives recovery instructions without creating a paid session", async () => {
  const error = new Error("denied"); error.name = "NotAllowedError";
  const e = entorno({ permisoError: error }); await e.iniciar();
  assert.match(e.controller.getSnapshot().error, /Permite el micrófono/);
  assert.equal(e.tokens, 0);
  assert.equal(e.contextos[0].state, "closed");
});

test("worklet failure stops an already acquired microphone", async () => {
  const e = entorno({ workletError: true }); await e.iniciar();
  assert.ok(e.pista.stopped);
  assert.equal(e.tokens, 0);
  assert.equal(e.controller.getSnapshot().estado, "error");
});

test("interleaved transcripts remain grouped per speaker and split at turn boundaries", async () => {
  const e = entorno(); await e.iniciar();
  e.recibir({ inputTranscription: { text: "Hello " } });
  e.recibir({ outputTranscription: { text: "Welcome " } });
  e.recibir({ inputTranscription: { text: "there", finished: true } });
  e.recibir({ outputTranscription: { text: "back", finished: true }, turnComplete: true });
  e.recibir({ inputTranscription: { text: "Thanks", finished: true } });
  assert.deepEqual(Array.from(e.controller.getSnapshot().mensajes, m => m.texto), ["Hello there", "Welcome back", "Thanks"]);
  e.controller.finalizar();
});

test("losing the microphone ends the session and releases resources", async () => {
  const e = entorno(); await e.iniciar(); e.pista.onended();
  assert.equal(e.controller.getSnapshot().estado, "error");
  assert.ok(e.sesiones[0].closed);
  assert.match(e.controller.getSnapshot().error, /desconectó/);
});

test("timeout can be cancelled safely even if permission arrives later", async () => {
  const gate = pendiente(), e = entorno({ microfonoPendiente: gate });
  const inicio = e.iniciar(); [...e.temporizadores.values()][0]();
  gate.resolver(e.flujo); await inicio;
  assert.equal(e.controller.getSnapshot().estado, "error");
  assert.ok(e.pista.stopped);
  assert.equal(e.tokens, 0);
});

test("text cannot send offline; separate messages stay separate in a live session", async () => {
  const e = entorno();
  assert.equal(e.controller.enviarTexto("Hello"), false);
  await e.iniciar();
  assert.equal(e.controller.enviarTexto("  "), false);
  assert.equal(e.controller.enviarTexto(" Hello "), true);
  assert.equal(e.controller.enviarTexto("There"), true);
  assert.deepEqual(Array.from(e.controller.getSnapshot().mensajes, m => m.texto), ["Hello", "There"]);
  assert.equal(e.controller.getSnapshot().esperandoRespuesta, true);
  e.controller.finalizar();
});

test("audio upload failure cleans up instead of repeatedly throwing from the worklet", async () => {
  const e = entorno({ sendError: true }); await e.iniciar(); e.audio();
  assert.equal(e.controller.getSnapshot().estado, "error");
  assert.equal(e.capturas[0].port.onmessage, null);
  assert.ok(e.pista.stopped);
});

const base = configuracion.CONFIGURACION_INICIAL;
test("manual mode only streams inside explicit activity and flushes the final packet before ending", async () => {
  const e = entorno({ flushPendiente: true }); await e.iniciar({ ...base, escucha: "pulsar" });
  assert.equal(e.pista.enabled, false); e.audio(); assert.equal(e.sesiones[0].inputs.length, 0);
  e.recibir(audio);
  e.controller.pulsar(true); e.controller.pulsar(true);
  assert.equal(e.pista.enabled, true); assert.ok(e.contextos[1].sources[0].stopped);
  e.audio(); e.controller.pulsar(false); e.controller.pulsar(false);
  assert.equal(e.pista.enabled, false);
  e.audio(); // The worklet tail still belongs to this turn.
  e.capturas[0].port.onmessage({ data: "flushed" }); e.audio();
  assert.deepEqual(e.sesiones[0].inputs.map(i => Object.keys(i)[0]), ["activityStart", "audio", "audio", "activityEnd"]);
  e.controller.pulsar(true); assert.equal(e.pista.enabled, true);
  e.controller.finalizar(); assert.ok(e.pista.stopped);
});

test("manual release falls back if the audio thread is suspended", async () => {
  const e = entorno({ flushPendiente: true }); await e.iniciar({ ...base, escucha: "pulsar" });
  e.controller.pulsar(true); e.controller.pulsar(false);
  [...e.temporizadores.values()][0]();
  assert.equal(Object.keys(e.sesiones[0].inputs.at(-1))[0], "activityEnd");
  e.controller.pulsar(true); assert.equal(e.controller.getSnapshot().pulsando, true);
  e.controller.finalizar();
});

test("worklet flush preserves the partial PCM packet exactly", async () => {
  const e = entorno(); await e.iniciar();
  let Clase; const packets = [];
  runInNewContext(await e.worklet.text(), { Float32Array, AudioWorkletProcessor: class { port = { postMessage: data => packets.push(data) }; }, registerProcessor: (_, c) => { Clase = c; } });
  const worklet = new Clase(); worklet.process([[new Float32Array([.25, -.5])]]);
  assert.equal(packets.length, 0); worklet.port.onmessage();
  assert.deepEqual(Array.from(packets[0]), [.25, -.5]); assert.equal(packets[1], "flushed");
  e.controller.finalizar();
});

test("session configuration reaches the token action and the transport unchanged", async () => {
  const c = { ...base, modo: "simulacion", papel: "huesped", tema: "Room service" };
  const e = entorno(); await e.iniciar(c);
  assert.deepEqual(e.solicitud.configuracion, c); assert.deepEqual(e.preferencias, c);
  e.controller.ayudar("cambiar_papel");
  assert.equal(e.controller.getSnapshot().papelActual, "colaborador");
  assert.equal(e.controller.getSnapshot().mensajes.length, 0, "Internal commands are not student evidence");
  e.controller.ayudar("explicar"); assert.equal(e.controller.getSnapshot().ayudaActiva, true);
  e.tool("actualizar_contexto", { ayudaActiva: false, papelEstudiante: "huesped" });
  assert.equal(e.controller.getSnapshot().ayudaActiva, false);
  assert.equal(e.controller.getSnapshot().papelActual, "huesped");
  e.controller.finalizar();
});

test("teacher kickoff uses the selected explanation language instead of a roleplay greeting", async () => {
  const e = entorno(); await e.iniciar({ ...base, modo: "profesor", tema: "Do versus does" });
  const apertura = e.sesiones[0].turns[0].turns[0].parts[0].text;
  assert.match(apertura, /Speak in Spanish/); assert.match(apertura, /chosen learning goal/);
  assert.doesNotMatch(apertura, /in character/); e.controller.finalizar();
});

const review = { logro: { detalle: "Expresaste lo que necesitas", evidencia: "I need a room" }, correcciones: [{ original: "I wants a room", mejora: "I want a room", explicacion: "Usa want con I" }], frase: "Could I book a room?" };
test("ending stops the microphone immediately, validates review evidence and closes the socket", async () => {
  const e = entorno(); await e.iniciar();
  e.controller.enviarTexto("I need a room"); e.controller.enviarTexto("I wants a room"); e.recibir(audio);
  e.controller.cerrarConResumen();
  assert.ok(e.pista.stopped); assert.equal(e.controller.getSnapshot().estadoResumen, "preparando");
  const sources = e.contextos[1].sources.length; e.recibir(audio); assert.equal(e.contextos[1].sources.length, sources);
  e.tool("entregar_resumen", review);
  assert.equal(e.controller.getSnapshot().estadoResumen, "listo");
  assert.equal(e.controller.getSnapshot().resumen.correcciones.length, 1);
  assert.ok(e.sesiones[0].closed); assert.equal(e.temporizadores.size, 0);
});

test("review rejects invented achievement evidence and filters invented error quotes", async () => {
  assert.equal(revision.validarResumen(review, ["Something else"]), null);
  const valid = revision.validarResumen(review, ["I need a room"]);
  assert.equal(valid.correcciones.length, 0);
  const e = entorno(); await e.iniciar(); e.controller.enviarTexto("Hello"); e.controller.cerrarConResumen();
  e.tool("entregar_resumen", review);
  assert.equal(e.controller.getSnapshot().resumen, null);
  [...e.temporizadores.values()][0]();
  assert.equal(e.controller.getSnapshot().estadoResumen, "no_disponible"); assert.ok(e.sesiones[0].closed);
});

test("only-on-request corrections do not trigger an unsolicited final review", async () => {
  const e = entorno(); await e.iniciar({ ...base, correcciones: "a_peticion" });
  e.controller.enviarTexto("Hello"); const count = e.sesiones[0].turns.length;
  e.controller.cerrarConResumen();
  assert.equal(e.sesiones[0].turns.length, count); assert.ok(e.sesiones[0].closed);
  assert.equal(e.controller.getSnapshot().estadoResumen, "inactivo");
  await e.iniciar({ ...base, correcciones: "a_peticion" }); e.controller.enviarTexto("Hello");
  e.controller.cerrarConResumen(true); assert.equal(e.controller.getSnapshot().estadoResumen, "preparando"); e.controller.finalizar();
});

test("summary transport failure releases resources without corrupting the conversation", async () => {
  const e = entorno(); await e.iniciar(); e.controller.enviarTexto("Hello"); e.controller.cerrarConResumen();
  e.sesiones[0].callbacks.onerror({});
  assert.equal(e.controller.getSnapshot().estadoResumen, "no_disponible");
  assert.equal(e.controller.getSnapshot().estado, "finalizada");
  assert.equal(e.controller.getSnapshot().mensajes[0].texto, "Hello");
  assert.ok(e.sesiones[0].closed);
});

test("noise tuning uses low VAD sensitivity and manual mode disables automatic detection", () => {
  const { configuracionLive } = cargar(new URL("../components/learning/live-config.ts", import.meta.url));
  const automatic = configuracionLive("test", "test", base).realtimeInputConfig.automaticActivityDetection;
  assert.equal(automatic.startOfSpeechSensitivity, "START_SENSITIVITY_LOW");
  assert.equal(automatic.silenceDurationMs, 1200);
  assert.equal(configuracionLive("test", "test", { ...base, escucha: "pulsar" }).realtimeInputConfig.automaticActivityDetection.disabled, true);
});

test("preferences reject unknown values and never restore conversation topics", () => {
  const parsed = configuracion.leerPreferencias({ modo: "admin", papel: "bad", correcciones: "never", tema: "Private topic", escucha: "pulsar" });
  assert.equal(parsed.modo, "libre"); assert.equal(parsed.papel, "colaborador"); assert.equal(parsed.tema, ""); assert.equal(parsed.escucha, "pulsar");
});

test("prompt modes are independent of the catalog and assign opposite simulation roles", () => {
  const { construirInstruccion, buscarEscenario } = cargar(new URL("../convex/conversacionEscenarios.ts", import.meta.url));
  const libre = construirInstruccion(undefined, "A1", base);
  const profesor = construirInstruccion(undefined, null, { ...base, modo: "profesor" });
  const guest = construirInstruccion(buscarEscenario("llegada_huesped"), "B1", { ...base, modo: "simulacion", papel: "huesped" });
  const staff = construirInstruccion(undefined, "B2", { ...base, modo: "simulacion", papel: "colaborador", tema: "Parking" });
  assert.match(libre, /friend/i); assert.match(profesor, /teacher/i);
  assert.match(guest, /LEARNER is the hotel guest/i); assert.match(staff, /LEARNER is the hotel staff/i);
  assert.match(staff, /Parking/);
  assert.doesNotMatch(libre, /25 words|must use.*vocabulary/i);
});
