"use client";

import type {
  LiveCallbacks,
  LiveSendClientContentParameters,
  LiveSendRealtimeInputParameters,
  LiveSendToolResponseParameters,
  LiveServerMessage,
  Session,
} from "@google/genai";
import type { ConfiguracionPractica } from "../../lib/practice-config";
import { DESCRIPCION_ACTUALIZAR_CONTEXTO, DESCRIPCION_ENTREGAR_RESUMEN, ESQUEMA_ACTUALIZAR_CONTEXTO, ESQUEMA_ENTREGAR_RESUMEN, INSTRUCCION_HERRAMIENTAS } from "../../lib/practice-tools";

const URL_LLAMADAS = "https://api.openai.com/v1/realtime/calls";

export type DatosSesionOpenAI = { token: string; modelo: string; instruccion: string; voz: string };
export type TransporteAudio = { flujo: MediaStream | null; salida: (flujoRemoto: MediaStream) => void };

type Turno = { role: string; parts: { text?: string }[] };
type SesionAdaptada = {
  sendRealtimeInput: (params: LiveSendRealtimeInputParameters) => void;
  sendClientContent: (params: LiveSendClientContentParameters) => void;
  sendToolResponse: (params: LiveSendToolResponseParameters) => void;
  close: () => void;
};

function configuracionSesion(datos: DatosSesionOpenAI, configuracion: ConfiguracionPractica) {
  return {
    type: "realtime",
    output_modalities: ["audio"],
    instructions: `${datos.instruccion}\n${INSTRUCCION_HERRAMIENTAS}`,
    audio: {
      input: {
        transcription: { model: "gpt-live-transcribe" },
        turn_detection: configuracion.escucha === "pulsar" ? null : { type: "semantic_vad" },
      },
      output: { voice: datos.voz },
    },
    tools: [
      { type: "function", name: "actualizar_contexto", description: DESCRIPCION_ACTUALIZAR_CONTEXTO, parameters: ESQUEMA_ACTUALIZAR_CONTEXTO },
      { type: "function", name: "entregar_resumen", description: DESCRIPCION_ENTREGAR_RESUMEN, parameters: ESQUEMA_ENTREGAR_RESUMEN },
    ],
    tool_choice: "auto",
  };
}

function normalizarTurnos(turns: unknown): Turno[] {
  if (typeof turns === "string") return [{ role: "user", parts: [{ text: turns }] }];
  const lista = Array.isArray(turns) ? turns : [turns];
  const salida: Turno[] = [];
  for (const elemento of lista) {
    if (!elemento || typeof elemento !== "object") continue;
    const contenido = elemento as { role?: string; parts?: unknown; text?: string };
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

function parsearArgumentos(texto: unknown): Record<string, unknown> {
  if (typeof texto !== "string" || !texto.trim()) return {};
  try {
    const datos = JSON.parse(texto) as unknown;
    return datos && typeof datos === "object" ? (datos as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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

export async function conectarRealtimeOpenAI(
  datos: DatosSesionOpenAI,
  callbacks: LiveCallbacks,
  configuracion: ConfiguracionPractica,
  transporte?: TransporteAudio
): Promise<Session> {
  const pc = new RTCPeerConnection();
  const canal = pc.createDataChannel("oai-events");
  let abierto = false;
  let sonandoTutor = false;
  let deltaEntrada = false;
  let deltaSalida = false;

  const emitir = (mensaje: Record<string, unknown>) => {
    callbacks.onmessage(mensaje as unknown as LiveServerMessage);
  };
  const enviar = (evento: Record<string, unknown>) => {
    if (abierto) canal.send(JSON.stringify(evento));
  };
  const cerrarTodo = () => {
    abierto = false;
    try { canal.close(); } catch { /* The channel may already be closed. */ }
    try { pc.close(); } catch { /* The connection may already be closed. */ }
  };

  const listo = new Promise<void>((resolver) => {
    canal.onopen = () => {
      abierto = true;
      canal.send(JSON.stringify({ type: "session.update", session: configuracionSesion(datos, configuracion) }));
      resolver();
    };
  });

  canal.onmessage = (evento) => {
    let datosEvento: Record<string, unknown>;
    try {
      datosEvento = JSON.parse(String(evento.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    const tipo = datosEvento.type;
    switch (tipo) {
      case "conversation.item.input_audio_transcription.delta": {
        const delta = typeof datosEvento.delta === "string" ? datosEvento.delta : "";
        if (delta) {
          deltaEntrada = true;
          emitir({ serverContent: { inputTranscription: { text: delta } } });
        }
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = typeof datosEvento.transcript === "string" ? datosEvento.transcript : "";
        emitir({ serverContent: { inputTranscription: { ...(deltaEntrada ? {} : { text: transcript }), finished: true } } });
        deltaEntrada = false;
        break;
      }
      case "response.output_audio_transcript.delta": {
        const delta = typeof datosEvento.delta === "string" ? datosEvento.delta : "";
        if (delta) {
          deltaSalida = true;
          emitir({ serverContent: { outputTranscription: { text: delta } } });
        }
        break;
      }
      case "response.output_audio_transcript.done": {
        const transcript = typeof datosEvento.transcript === "string" ? datosEvento.transcript : "";
        emitir({ serverContent: { outputTranscription: { ...(deltaSalida ? {} : { text: transcript }), finished: true } } });
        deltaSalida = false;
        break;
      }
      case "output_audio_buffer.started": {
        sonandoTutor = true;
        emitir({ vozRemota: { hablando: true } });
        break;
      }
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared": {
        sonandoTutor = false;
        emitir({ vozRemota: { hablando: false } });
        break;
      }
      case "input_audio_buffer.speech_started": {
        emitir({ serverContent: { interrupted: true } });
        break;
      }
      case "response.done": {
        const salida = (datosEvento.response as { output?: unknown[] } | undefined)?.output ?? [];
        const llamadas = salida
          .filter((elemento): elemento is { type?: string; status?: string; call_id?: string; name?: string; arguments?: string } =>
            typeof elemento === "object" && elemento !== null &&
            (elemento as { type?: string }).type === "function_call" &&
            (elemento as { status?: string }).status === "completed"
          )
          .map((elemento) => ({ id: elemento.call_id ?? "", name: elemento.name ?? "", args: parsearArgumentos(elemento.arguments) }));
        if (llamadas.length) emitir({ toolCall: { functionCalls: llamadas } });
        emitir({ serverContent: { turnComplete: true } });
        break;
      }
      case "error": {
        const mensaje = (datosEvento.error as { message?: string } | undefined)?.message ?? "Error de OpenAI.";
        console.error("[OpenAI Realtime]", mensaje);
        callbacks.onerror?.({ message: mensaje } as unknown as ErrorEvent);
        break;
      }
      default:
        break;
    }
  };
  canal.onerror = () => callbacks.onerror?.({ message: "Error en el canal de datos." } as unknown as ErrorEvent);

  pc.ontrack = (evento) => {
    const flujo = evento.streams[0] ?? new MediaStream([evento.track]);
    transporte?.salida(flujo);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") callbacks.onerror?.({ message: "La conexión WebRTC falló." } as unknown as ErrorEvent);
  };

  if (transporte?.flujo) {
    for (const pista of transporte.flujo.getAudioTracks()) pc.addTrack(pista, transporte.flujo);
  } else {
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  const oferta = await pc.createOffer();
  await pc.setLocalDescription(oferta);
  await esperarIce(pc);
  const respuesta = await fetch(URL_LLAMADAS, {
    method: "POST",
    headers: { Authorization: `Bearer ${datos.token}`, "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? oferta.sdp,
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    cerrarTodo();
    throw new Error(`OpenAI rechazó la conexión (${respuesta.status}): ${detalle.slice(0, 200)}`);
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await respuesta.text() });
  await listo;

  const sesion: SesionAdaptada = {
    sendRealtimeInput: (params) => {
      if (params.activityStart) {
        if (sonandoTutor) {
          enviar({ type: "response.cancel" });
          enviar({ type: "output_audio_buffer.clear" });
        }
        return;
      }
      if (params.activityEnd) {
        if (configuracion.escucha === "pulsar") {
          enviar({ type: "input_audio_buffer.commit" });
          enviar({ type: "response.create" });
        }
        return;
      }
      if (params.audioStreamEnd || params.audio) return;
    },
    sendClientContent: (params) => {
      for (const turno of normalizarTurnos(params.turns)) {
        const contenido = turno.parts
          .map((parte) => parte.text)
          .filter((texto): texto is string => typeof texto === "string" && texto.length > 0)
          .map((texto) => ({ type: "input_text", text: texto }));
        if (!contenido.length) continue;
        enviar({ type: "conversation.item.create", item: { type: "message", role: turno.role === "model" ? "assistant" : "user", content: contenido } });
      }
      if (params.turnComplete !== false) enviar({ type: "response.create" });
    },
    sendToolResponse: (params) => {
      const respuestas = Array.isArray(params.functionResponses) ? params.functionResponses : [params.functionResponses];
      for (const respuesta of respuestas) {
        enviar({ type: "conversation.item.create", item: { type: "function_call_output", call_id: respuesta.id, output: JSON.stringify(respuesta.response ?? { ok: true }) } });
      }
      enviar({ type: "response.create" });
    },
    close: cerrarTodo,
  };

  return sesion as unknown as Session;
}
