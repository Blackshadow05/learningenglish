import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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
  let permisos = 0, tokens = 0, reloj = 10000, timerId = 0;
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
    constructor() { this.port = { onmessage: null, close() {} }; capturas.push(this); }
    connect() {}
    disconnect() {}
  }
  const exports = {};
  runInNewContext(codigo, {
    exports, Error, Float32Array, Uint8Array, DataView, btoa, atob, Blob,
    AudioContext: Contexto, AudioWorkletNode: Captura,
    navigator: { mediaDevices: { getUserMedia: async () => {
      permisos++;
      if (opciones.permisoError) throw opciones.permisoError;
      return opciones.microfonoPendiente?.promesa ?? flujo;
    } } },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    performance: { now: () => reloj },
    setTimeout: callback => { temporizadores.set(++timerId, callback); return timerId; },
    clearTimeout: id => temporizadores.delete(id),
    setInterval: () => 1, clearInterval() {},
  });
  const controller = new exports.ConversacionLive({
    crearToken: async () => {
      tokens++;
      return opciones.tokenPendiente?.promesa ?? { token: "test", modelo: "test", voz: "test", instruccion: "test" };
    },
    conectar: async (_, callbacks) => {
      const sesion = {
        callbacks, inputs: [], turns: [], closed: false,
        sendRealtimeInput(input) { if (opciones.sendError) throw new Error("closed"); this.inputs.push(input); },
        sendClientContent(turn) { this.turns.push(turn); },
        close() { this.closed = true; callbacks.onclose?.({}); },
      };
      sesiones.push(sesion);
      return opciones.conexionPendiente ? opciones.conexionPendiente.promesa.then(() => sesion) : sesion;
    },
  });
  return {
    controller, pista, flujo, contextos, capturas, sesiones, temporizadores,
    get permisos() { return permisos; }, get tokens() { return tokens; },
    iniciar: () => controller.iniciar("llegada_huesped", "A1"),
    recibir: content => sesiones.at(-1).callbacks.onmessage({ serverContent: content }),
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
