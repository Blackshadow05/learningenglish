"use client";

import type {
  LiveCallbacks,
  LiveSendClientContentParameters,
  LiveSendRealtimeInputParameters,
  LiveSendToolResponseParameters,
  LiveServerMessage,
  Session,
} from "@google/genai";
import type { ActividadVoz, DatosSesionGpt, TransporteAudio } from "./gpt-live";
import { usoRealtime, usoTranscripcion } from "../../lib/api-costs";

// gpt-realtime-2.1-mini over WebRTC: SDP exchange against /v1/realtime with the
// ephemeral client secret, one data channel for events, native function calling.
const URL_LLAMADAS = "https://api.openai.com/v1/realtime/calls";
const RETRASO_COMMIT_MS = 350;
const PULSACION_MINIMA_MS = 200;
const LIMITE_INICIO_MS = 20000;
const ESCUCHA_MS = 60;
const HUECO_MAXIMO = 2;
const VOZ_INICIO_MS = 150;
const VOZ_INTERRUPCION_MS = 350;
const SILENCIO_FIN_MS = 1200;
const VOZ_SEGURA_MS = 500;
const ESPERA_TRANSCRIPCION_MS = 2000;
const MS_POR_PALABRA = 200;
const ALUCINACIONES = new Set(["you", "thank you", "thanks", "thanks for watching", "bye"]);
const REPOSO_MS = 1500;
const LIMPIEZA_MS = 2500;

export type EjecutarHerramientaMini = (args: { nombre: string; argumentos: string }) => Promise<unknown>;

type Turno = { role: string; parts: { text?: string }[] };

type SesionAdaptada = {
  sendRealtimeInput: (params: LiveSendRealtimeInputParameters) => void;
  sendClientContent: (params: LiveSendClientContentParameters) => void;
  sendToolResponse: (params: LiveSendToolResponseParameters) => void;
  agregarInstruccion: (texto: string) => void;
  agregarMensajeUsuario: (texto: string) => void;
  agregarContexto: (texto: string) => void;
  solicitarResumen: (texto: string) => void;
  close: () => void;
};

function normalizarTurnos(turns: unknown): Turno[] {
  const lista = Array.isArray(turns) ? turns : [turns];
  const salida: Turno[] = [];
  for (const elemento of lista) {
    if (!elemento || typeof elemento !== "object") continue;
    const contenido = elemento as { role?: string; parts?: unknown; text?: unknown };
    if (typeof contenido.text === "string") {
      salida.push({ role: "user", parts: [{ text: contenido.text }] });
      continue;
    }
    const partes = Array.isArray(contenido.parts) ? contenido.parts : [];
    salida.push({
      role: contenido.role ?? "user",
      parts: partes.filter((parte): parte is { text?: string } => typeof parte === "object" && parte !== null),
    });
  }
  return salida;
}

function parsearArgumentos(texto: string): Record<string, unknown> {
  if (!texto.trim()) return {};
  try {
    const datos = JSON.parse(texto) as unknown;
    return datos && typeof datos === "object" ? (datos as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function conectarRealtimeMini(
  datos: DatosSesionGpt,
  callbacks: LiveCallbacks,
  transporte: TransporteAudio | undefined,
  ejecutarHerramienta: EjecutarHerramientaMini,
  manual = false
): Promise<Session> {
  const pc = new RTCPeerConnection();
  const canal = pc.createDataChannel("oai-events");
  let abierto = false;
  let cerrado = false;
  let respuestaActiva = false;
  let crearPendiente = false;
  let tutorHablando = false;
  let soloTexto = false;
  let inicioPulsacion = 0;
  let notas = 0;
  let notaActual = "";
  let escucha: ReturnType<typeof setInterval> | undefined;
  let enTurno = false;
  let vozTurno = 0;
  let ultimaVoz = -Infinity;
  let ultimaLimpieza = 0;
  let anterior: ActividadVoz | null = null;
  let rachaTotal = 0;
  let rachaClara = 0;
  let huecoTotal = 0;
  let huecoClara = 0;
  let turnoDudoso = false;
  let vozDudosa = 0;
  let itemEnDuda = "";
  let esperaTexto: ReturnType<typeof setTimeout> | undefined;
  const descartados = new Set<string>();
  let commitPendiente: ReturnType<typeof setTimeout> | undefined;
  let resolverInicio: (() => void) | null = null;
  let rechazarInicio: ((error: Error) => void) | null = null;
  const inicio = new Promise<void>((resolver, rechazar) => {
    resolverInicio = resolver;
    rechazarInicio = rechazar;
  });
  const limiteInicio = setTimeout(() => rechazarInicio?.(new Error("Realtime Mini tardó demasiado en iniciar.")), LIMITE_INICIO_MS);

  const emitir = (mensaje: Record<string, unknown>) => {
    callbacks.onmessage(mensaje as unknown as LiveServerMessage);
  };
  const enviar = (evento: Record<string, unknown>) => {
    if (abierto && canal.readyState === "open") canal.send(JSON.stringify(evento));
  };
  const cerrarTodo = () => {
    cerrado = true;
    abierto = false;
    clearTimeout(commitPendiente);
    clearTimeout(limiteInicio);
    clearInterval(escucha);
    clearTimeout(esperaTexto);
    try { canal.close(); } catch { /* The channel may already be closed. */ }
    try { pc.close(); } catch { /* The connection may already be closed. */ }
  };

  const crearRespuesta = () => {
    if (respuestaActiva) {
      crearPendiente = true;
      return;
    }
    enviar(soloTexto ? { type: "response.create", response: { output_modalities: ["text"] } } : { type: "response.create" });
  };
  const interrumpir = () => {
    if (respuestaActiva) enviar({ type: "response.cancel" });
    if (tutorHablando) enviar({ type: "output_audio_buffer.clear" });
  };
  const agregarMensaje = (rol: "user" | "system", texto: string) => {
    enviar({ type: "conversation.item.create", item: { type: "message", role: rol, content: [{ type: "input_text", text: texto }] } });
  };
  const devolverHerramienta = (callId: string, resultado: unknown) => {
    enviar({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(resultado ?? { ok: true }) } });
  };
  const limpiarEntrada = () => {
    enviar({ type: "input_audio_buffer.clear" });
    ultimaLimpieza = performance.now();
  };
  const escuchar = () => {
    const actual = transporte?.actividad?.();
    if (!actual || soloTexto) return;
    const t = performance.now();
    const total = anterior ? Math.max(0, actual.total - anterior.total) : 0;
    const clara = anterior ? Math.max(0, actual.clara - anterior.clara) : 0;
    anterior = actual;
    if (total > 0) {
      ultimaVoz = t;
      rachaTotal += total;
      huecoTotal = 0;
    } else if (++huecoTotal > HUECO_MAXIMO) {
      rachaTotal = 0;
    }
    if (clara > 0) {
      rachaClara += clara;
      huecoClara = 0;
    } else if (++huecoClara > HUECO_MAXIMO) {
      rachaClara = 0;
    }
    const tutorActivo = tutorHablando || respuestaActiva;
    if (!enTurno) {
      const inicia = tutorActivo ? rachaClara >= VOZ_INTERRUPCION_MS : rachaTotal >= VOZ_INICIO_MS;
      if (inicia) {
        enTurno = true;
        vozTurno = rachaTotal;
        if (tutorActivo) {
          interrumpir();
          emitir({ serverContent: { interrupted: true } });
        }
      } else if (t - ultimaVoz > REPOSO_MS && t - ultimaLimpieza > LIMPIEZA_MS) {
        limpiarEntrada();
      }
      return;
    }
    vozTurno += total;
    if (t - ultimaVoz < SILENCIO_FIN_MS) return;
    enTurno = false;
    rachaTotal = 0;
    rachaClara = 0;
    turnoDudoso = vozTurno < VOZ_SEGURA_MS;
    vozDudosa = vozTurno;
    enviar({ type: "input_audio_buffer.commit" });
    if (!turnoDudoso) crearRespuesta();
  };
  const aceptarTurno = (item: string) => {
    emitir({ turnoEstudiante: true });
    if (item) emitir({ textoInterno: { rol: "estudiante", texto: "", item } });
  };
  const descartarTurno = (item: string) => {
    clearTimeout(esperaTexto);
    if (itemEnDuda === item) itemEnDuda = "";
    descartados.add(item);
    enviar({ type: "conversation.item.delete", item_id: item });
  };
  const tienePalabras = (transcripcion: string, voz: number) => {
    const limpia = transcripcion.toLowerCase().replace(/[^\p{L}\s']/gu, " ").replace(/\s+/g, " ").trim();
    const palabras = limpia ? limpia.split(" ").length : 0;
    return /\p{L}{2,}/u.test(limpia) && !ALUCINACIONES.has(limpia) && palabras <= 1 + Math.floor(voz / MS_POR_PALABRA);
  };

  canal.onopen = () => { abierto = true; };
  canal.onclose = () => {
    abierto = false;
    if (!cerrado) callbacks.onclose?.({} as CloseEvent);
  };
  canal.onerror = () => {
    if (!cerrado) callbacks.onerror?.({ message: "Error en el canal de datos." } as unknown as ErrorEvent);
  };
  canal.onmessage = (evento) => {
    let datosEvento: Record<string, unknown>;
    try {
      datosEvento = JSON.parse(String(evento.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    const texto = (clave: string) => (typeof datosEvento[clave] === "string" ? (datosEvento[clave] as string) : "");
    switch (datosEvento.type) {
      case "session.created": {
        const sesion = datosEvento.session as { audio?: { input?: { turn_detection?: unknown } } } | undefined;
        if (!manual && sesion?.audio?.input?.turn_detection === null && transporte?.actividad) {
          clearInterval(escucha);
          escucha = setInterval(escuchar, ESCUCHA_MS);
        }
        clearTimeout(limiteInicio);
        resolverInicio?.();
        break;
      }
      case "input_audio_buffer.speech_started":
        emitir({ serverContent: { interrupted: true } });
        break;
      case "input_audio_buffer.committed": {
        const item = texto("item_id");
        if (turnoDudoso && item) {
          turnoDudoso = false;
          itemEnDuda = item;
          clearTimeout(esperaTexto);
          esperaTexto = setTimeout(() => descartarTurno(item), ESPERA_TRANSCRIPCION_MS);
          break;
        }
        turnoDudoso = false;
        aceptarTurno(item);
        break;
      }
      case "conversation.item.input_audio_transcription.delta": {
        const item = texto("item_id");
        if (item && texto("delta") && item !== itemEnDuda && !descartados.has(item)) emitir({ textoInterno: { rol: "estudiante", texto: texto("delta"), item } });
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        if (datosEvento.usage) emitir({ consumo: { concepto: "transcripcion", modelo: "", uso: usoTranscripcion(datosEvento.usage) } });
        const item = texto("item_id");
        if (!item || descartados.has(item)) break;
        if (item === itemEnDuda) {
          if (!tienePalabras(texto("transcript"), vozDudosa)) {
            descartarTurno(item);
            break;
          }
          clearTimeout(esperaTexto);
          itemEnDuda = "";
          aceptarTurno(item);
          crearRespuesta();
        }
        emitir({ textoInterno: { rol: "estudiante", texto: texto("transcript"), item, final: true } });
        break;
      }
      case "conversation.item.input_audio_transcription.failed": {
        const item = texto("item_id");
        if (item && item === itemEnDuda) descartarTurno(item);
        break;
      }
      case "response.created":
        respuestaActiva = true;
        break;
      case "response.output_audio_transcript.delta":
        emitir({ serverContent: { outputTranscription: { text: texto("delta") } } });
        break;
      case "response.output_audio_transcript.done":
        emitir({ serverContent: { outputTranscription: { finished: true } } });
        break;
      case "output_audio_buffer.started":
        tutorHablando = true;
        emitir({ vozRemota: { hablando: true } });
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        tutorHablando = false;
        if (escucha && !enTurno) limpiarEntrada();
        emitir({ vozRemota: { hablando: false } });
        break;
      case "response.output_item.done": {
        const item = datosEvento.item as { type?: unknown; call_id?: unknown; name?: unknown; arguments?: unknown } | undefined;
        if (item?.type !== "function_call" || typeof item.call_id !== "string" || typeof item.name !== "string") break;
        const callId = item.call_id;
        const nombre = item.name;
        const argumentos = typeof item.arguments === "string" ? item.arguments : "";
        if (nombre !== "guardar_progreso") {
          emitir({ toolCall: { functionCalls: [{ id: callId, name: nombre, args: parsearArgumentos(argumentos) }] } });
          break;
        }
        void ejecutarHerramienta({ nombre, argumentos })
          .then((resultado) => devolverHerramienta(callId, resultado))
          .catch(() => devolverHerramienta(callId, { error: "Tool execution failed" }))
          .finally(crearRespuesta);
        break;
      }
      case "response.done": {
        respuestaActiva = false;
        const respuesta = datosEvento.response as { status?: unknown; status_details?: unknown; usage?: unknown } | undefined;
        if (respuesta?.usage) emitir({ consumo: { concepto: "voz", modelo: datos.modelo, uso: usoRealtime(respuesta.usage) } });
        if (respuesta?.status === "failed" || respuesta?.status === "incomplete") {
          console.warn("[Realtime-Mini]", respuesta.status, respuesta.status_details);
        }
        emitir({ serverContent: { turnComplete: true } });
        if (crearPendiente) {
          crearPendiente = false;
          crearRespuesta();
        }
        break;
      }
      case "error": {
        const error = datosEvento.error as { message?: unknown; code?: unknown } | undefined;
        if (error?.code === "conversation_already_has_active_response") {
          crearPendiente = true;
          break;
        }
        console.warn("[Realtime-Mini]", typeof error?.message === "string" ? error.message : datosEvento);
        break;
      }
      default:
        break;
    }
  };

  pc.ontrack = (evento) => {
    const flujo = evento.streams[0] ?? new MediaStream([evento.track]);
    transporte?.salida(flujo);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" && !cerrado) {
      callbacks.onerror?.({ message: "La conexión WebRTC con Realtime Mini falló." } as unknown as ErrorEvent);
    }
  };

  if (transporte?.flujo) {
    for (const pista of transporte.flujo.getAudioTracks()) pc.addTrack(pista, transporte.flujo);
  } else {
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  try {
    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    const respuesta = await fetch(URL_LLAMADAS, {
      method: "POST",
      headers: { Authorization: `Bearer ${datos.token}`, "Content-Type": "application/sdp" },
      body: oferta.sdp ?? "",
    });
    if (!respuesta.ok) {
      throw new Error(`OpenAI rechazó la conexión WebRTC (${respuesta.status}).`);
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await respuesta.text() });
    await inicio;
  } catch (error) {
    cerrarTodo();
    throw error;
  }

  const sesion: SesionAdaptada = {
    sendRealtimeInput: (params) => {
      if (params.activityStart) {
        clearTimeout(commitPendiente);
        inicioPulsacion = performance.now();
        interrumpir();
        enviar({ type: "input_audio_buffer.clear" });
      } else if (params.activityEnd) {
        const breve = performance.now() - inicioPulsacion < PULSACION_MINIMA_MS;
        clearTimeout(commitPendiente);
        commitPendiente = setTimeout(() => {
          if (breve) {
            enviar({ type: "input_audio_buffer.clear" });
            return;
          }
          enviar({ type: "input_audio_buffer.commit" });
          crearRespuesta();
        }, RETRASO_COMMIT_MS);
      }
    },
    sendClientContent: (params) => {
      for (const turno of normalizarTurnos(params.turns)) {
        const texto = turno.parts.map((parte) => parte.text).filter((valor): valor is string => typeof valor === "string" && valor.length > 0).join(" ");
        if (texto) agregarMensaje(turno.role === "system" ? "system" : "user", texto);
      }
      crearRespuesta();
    },
    sendToolResponse: (params) => {
      const respuestas = Array.isArray(params.functionResponses) ? params.functionResponses : [params.functionResponses];
      for (const respuesta of respuestas) {
        if (respuesta?.id) devolverHerramienta(respuesta.id, respuesta.response);
      }
      crearRespuesta();
    },
    agregarInstruccion: (texto) => {
      interrumpir();
      agregarMensaje("system", texto);
      crearRespuesta();
    },
    agregarMensajeUsuario: (texto) => {
      interrumpir();
      agregarMensaje("user", texto);
      crearRespuesta();
    },
    agregarContexto: (texto) => {
      if (notaActual) enviar({ type: "conversation.item.delete", item_id: notaActual });
      notaActual = `bloom_nota_${++notas}`;
      enviar({ type: "conversation.item.create", item: { id: notaActual, type: "message", role: "system", content: [{ type: "input_text", text: texto }] } });
    },
    solicitarResumen: (texto) => {
      soloTexto = true;
      clearInterval(escucha);
      clearTimeout(commitPendiente);
      interrumpir();
      agregarMensaje("system", texto);
      crearRespuesta();
    },
    close: cerrarTodo,
  };

  return sesion as unknown as Session;
}
