"use client";

import type {
  LiveCallbacks,
  LiveSendClientContentParameters,
  LiveSendRealtimeInputParameters,
  LiveSendToolResponseParameters,
  LiveServerMessage,
  Session,
} from "@google/genai";
import type { DatosSesionGpt, TransporteAudio } from "./gpt-live";

// gpt-realtime-2.1-mini over WebRTC: SDP exchange against /v1/realtime with the
// ephemeral client secret, one data channel for events, native function calling.
const URL_REALTIME = "https://api.openai.com/v1/realtime";

export type EjecutarHerramientaMini = (args: { nombre: string; argumentos: string }) => Promise<unknown>;

type Turno = { role: string; parts: { text?: string }[] };

type SesionAdaptada = {
  sendRealtimeInput: (params: LiveSendRealtimeInputParameters) => void;
  sendClientContent: (params: LiveSendClientContentParameters) => void;
  sendToolResponse: (params: LiveSendToolResponseParameters) => void;
  agregarInstruccion: (texto: string) => void;
  agregarMensajeUsuario: (texto: string) => void;
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

function esperarIce(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolver) => {
    const terminar = () => {
      clearTimeout(limite);
      pc.removeEventListener("icegatheringstatechange", revisar);
      resolver();
    };
    const revisar = () => {
      if (pc.iceGatheringState === "complete") terminar();
    };
    const limite = setTimeout(terminar, 3000);
    pc.addEventListener("icegatheringstatechange", revisar);
  });
}

export async function conectarRealtimeMini(
  datos: DatosSesionGpt,
  callbacks: LiveCallbacks,
  transporte: TransporteAudio | undefined,
  ejecutarHerramienta: EjecutarHerramientaMini
): Promise<Session> {
  const pc = new RTCPeerConnection();
  const canal = pc.createDataChannel("oai-events");
  let abierto = false;
  let temporizadorVoz: ReturnType<typeof setTimeout> | undefined;

  const emitir = (mensaje: Record<string, unknown>) => {
    callbacks.onmessage(mensaje as unknown as LiveServerMessage);
  };
  const enviar = (evento: Record<string, unknown>) => {
    if (abierto) canal.send(JSON.stringify(evento));
  };
  const cerrarTodo = () => {
    abierto = false;
    clearTimeout(temporizadorVoz);
    try { canal.close(); } catch { /* The channel may already be closed. */ }
    try { pc.close(); } catch { /* The connection may already be closed. */ }
  };

  canal.onopen = () => { abierto = true; };
  canal.onerror = () => callbacks.onerror?.({ message: "Error en el canal de datos." } as unknown as ErrorEvent);
  canal.onmessage = (evento) => {
    let datosEvento: Record<string, unknown>;
    try {
      datosEvento = JSON.parse(String(evento.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    const texto = (clave: string) => (typeof datosEvento[clave] === "string" ? (datosEvento[clave] as string) : "");
    switch (datosEvento.type) {
      case "input_audio_buffer.speech_started":
        // server_vad filters empty audio; a real interruption stops the tutor.
        emitir({ serverContent: { interrupted: true } });
        emitir({ vozRemota: { hablando: false } });
        break;
      case "conversation.item.input_audio_transcription.delta":
        emitir({ serverContent: { inputTranscription: { text: texto("delta") } } });
        break;
      case "conversation.item.input_audio_transcription.completed":
        emitir({ serverContent: { inputTranscription: { text: texto("transcript"), finished: true } } });
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        emitir({ serverContent: { outputTranscription: { text: texto("delta") } } });
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        emitir({ serverContent: { outputTranscription: { finished: true } } });
        break;
      case "response.output_audio.started":
      case "response.audio.started":
        clearTimeout(temporizadorVoz);
        emitir({ vozRemota: { hablando: true } });
        break;
      case "response.output_audio.stopped":
      case "response.audio.stopped":
        emitir({ vozRemota: { hablando: false } });
        break;
      case "response.function_call_arguments.done": {
        const callId = texto("call_id");
        const nombre = texto("name");
        void ejecutarHerramienta({ nombre, argumentos: texto("arguments") })
          .then((resultado) => {
            enviar({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: callId, output: JSON.stringify(resultado ?? { ok: true }) },
            });
            enviar({ type: "response.create" });
          })
          .catch(() => {
            enviar({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ error: "Tool execution failed" }) },
            });
          });
        break;
      }
      case "response.done": {
        const respuesta = datosEvento.response as { status?: unknown } | undefined;
        if (respuesta?.status === "failed") {
          callbacks.onerror?.({ message: "La respuesta de Realtime Mini falló." } as unknown as ErrorEvent);
          break;
        }
        emitir({ vozRemota: { hablando: false } });
        emitir({ serverContent: { turnComplete: true } });
        break;
      }
      case "error": {
        const mensaje = (datosEvento.error as { message?: unknown } | undefined)?.message;
        console.error("[Realtime-Mini]", typeof mensaje === "string" ? mensaje : "Error de Realtime Mini.");
        callbacks.onerror?.({ message: "Error de Realtime Mini." } as unknown as ErrorEvent);
        break;
      }
      default:
        break;
    }
  };  pc.ontrack = (evento) => {
    const flujo = evento.streams[0] ?? new MediaStream([evento.track]);
    transporte?.salida(flujo);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") callbacks.onerror?.({ message: "La conexión WebRTC con Realtime Mini falló." } as unknown as ErrorEvent);
  };

  if (transporte?.flujo) {
    for (const pista of transporte.flujo.getAudioTracks()) pc.addTrack(pista, transporte.flujo);
  } else {
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  try {
    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    await esperarIce(pc);
    const respuesta = await fetch(`${URL_REALTIME}?model=${encodeURIComponent(datos.modelo)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${datos.token}`, "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!respuesta.ok) {
      throw new Error(`OpenAI rechazó la conexión WebRTC (${respuesta.status}).`);
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await respuesta.text() });
  } catch (error) {
    cerrarTodo();
    throw error;
  }

  const sesion: SesionAdaptada = {
    sendRealtimeInput: () => {
      // Audio travels on the WebRTC media track; the app mutes the track directly.
    },
    sendClientContent: (params) => {
      for (const turno of normalizarTurnos(params.turns)) {
        const texto = turno.parts.map((parte) => parte.text).filter((valor): valor is string => typeof valor === "string" && valor.length > 0).join(" ");
        if (texto) {
          enviar({ type: "conversation.item.create", item: { type: "message", role: turno.role === "model" ? "assistant" : "user", content: [{ type: turno.role === "model" ? "text" : "input_text", text: texto }] } });
          enviar({ type: "response.create" });
        }
      }
    },
    sendToolResponse: () => {
      // Function calls are answered inside the data channel handler.
    },
    agregarInstruccion: (texto) => {
      enviar({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] } });
      enviar({ type: "response.create" });
    },
    agregarMensajeUsuario: (texto) => {
      enviar({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] } });
      enviar({ type: "response.create" });
    },
    close: cerrarTodo,
  };

  return sesion as unknown as Session;
}