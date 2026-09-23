"use client";

import type {
  LiveCallbacks,
  LiveSendClientContentParameters,
  LiveSendRealtimeInputParameters,
  LiveSendToolResponseParameters,
  LiveServerMessage,
  Session,
} from "@google/genai";

export type DatosSesionGpt = { token: string; modelo: string; instruccion: string; voz: string; sesionJson?: string };
export type TransporteAudio = { flujo: MediaStream | null; salida: (flujoRemoto: MediaStream) => void };
export type CrearSesionWebrtc = (args: { sdp: string; sesionJson: string }) => Promise<{ sesionId: string; sdp: string }>;

type Turno = { role: string; parts: { text?: string }[] };
type SesionAdaptada = {
  sendRealtimeInput: (params: LiveSendRealtimeInputParameters) => void;
  sendClientContent: (params: LiveSendClientContentParameters) => void;
  sendToolResponse: (params: LiveSendToolResponseParameters) => void;
  agregarInstruccion: (texto: string) => void;
  agregarMensajeUsuario: (texto: string) => void;
  silenciarEntrada: (silenciado: boolean) => void;
  close: () => void;
};

const LIMITE_INSTRUCCION = 1800;
const SILENCIO_TUTOR_MS = 1800;
const PAUSA_TURNO_MS = 1200;
const LIMITE_APOYO_MS = 25000;

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

export async function conectarGptLive(
  datos: DatosSesionGpt,
  callbacks: LiveCallbacks,
  transporte: TransporteAudio | undefined,
  crearSesion: CrearSesionWebrtc
): Promise<Session> {
  const pc = new RTCPeerConnection();
  const canal = pc.createDataChannel("oai-events");
  let abierto = false;
  let iniciada = false;
  let cerrado = false;
  let entradaAbierta = false;
  let ultimoFinEntrada = 0;
  let contadorEventos = 0;
  let entradaSilenciada: boolean | null = null;
  let temporizadorVoz: ReturnType<typeof setTimeout> | undefined;
  let temporizadorApoyo: ReturnType<typeof setTimeout> | undefined;
  let resolverInicio: (() => void) | null = null;
  let rechazarInicio: ((error: Error) => void) | null = null;

  const emitir = (mensaje: Record<string, unknown>) => {
    callbacks.onmessage(mensaje as unknown as LiveServerMessage);
  };
  const enviar = (evento: Record<string, unknown>) => {
    if (abierto && canal.readyState === "open") canal.send(JSON.stringify(evento));
  };
  const siguienteEvento = (prefijo: string) => `${prefijo}_${++contadorEventos}`;
  const silenciarEntrada = (silenciado: boolean) => {
    if (entradaSilenciada === silenciado) return;
    entradaSilenciada = silenciado;
    enviar({ type: silenciado ? "session.input_audio.mute" : "session.input_audio.unmute", event_id: siguienteEvento(silenciado ? "app_mute" : "app_unmute") });
  };
  const cerrarTodo = () => {
    cerrado = true;
    abierto = false;
    clearTimeout(temporizadorVoz);
    clearTimeout(temporizadorApoyo);
    try { canal.close(); } catch { /* The channel may already be closed. */ }
    try { pc.close(); } catch { /* The connection may already be closed. */ }
  };

  const instruir = (texto: string) => {
    enviar({ type: "session.instructions.append", event_id: siguienteEvento("app_instruction"), delegation_id: null, content: texto.slice(0, LIMITE_INSTRUCCION) });
  };

  const enviarAlBackend = (texto: string) => {
    enviar({ type: "response.item.create", event_id: siguienteEvento("app_message"), item: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] } });
    enviar({ type: "response.create", event_id: siguienteEvento("app_continue") });
  };

  const inicio = new Promise<void>((resolver, rechazar) => {
    resolverInicio = resolver;
    rechazarInicio = rechazar;
  });
  const limiteInicio = setTimeout(() => {
    rechazarInicio?.(new Error("La sesión de GPT-Live tardó demasiado en iniciar."));
  }, 20000);

  canal.onopen = () => {
    abierto = true;
  };
  canal.onmessage = (evento) => {
    let datosEvento: Record<string, unknown>;
    try {
      datosEvento = JSON.parse(String(evento.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (datosEvento.type) {
      case "session.started": {
        iniciada = true;
        clearTimeout(limiteInicio);
        resolverInicio?.();
        break;
      }
      case "session.closed": {
        const motivo = datosEvento.reason;
        iniciada = false;
        if (motivo !== "close_requested" && !cerrado) callbacks.onclose?.({} as CloseEvent);
        break;
      }
      case "session.input_transcript.delta": {
        if (typeof datosEvento.delta !== "string" || !datosEvento.delta.trim()) break;
        const inicioMs = typeof datosEvento.start_ms === "number" ? datosEvento.start_ms : 0;
        const finMs = typeof datosEvento.end_ms === "number" ? datosEvento.end_ms : inicioMs;
        if (!entradaAbierta || inicioMs - ultimoFinEntrada > PAUSA_TURNO_MS) emitir({ turnoEstudiante: true });
        entradaAbierta = true;
        ultimoFinEntrada = finMs;
        break;
      }
      case "session.output_transcript.delta": {
        entradaAbierta = false;
        emitir({ vozRemota: { hablando: true } });
        clearTimeout(temporizadorVoz);
        temporizadorVoz = setTimeout(() => emitir({ vozRemota: { hablando: false } }), SILENCIO_TUTOR_MS);
        break;
      }
      case "session.delegation.created": {
        emitir({ apoyo: true });
        clearTimeout(temporizadorApoyo);
        temporizadorApoyo = setTimeout(() => emitir({ apoyo: false }), LIMITE_APOYO_MS);
        break;
      }
      case "response.event": {
        const interno = datosEvento.event as Record<string, unknown> | undefined;
        if (interno?.type === "response.completed" || interno?.type === "response.failed" || interno?.type === "response.incomplete" || interno?.type === "response.cancelled") {
          clearTimeout(temporizadorApoyo);
          emitir({ apoyo: false });
        }
        if (interno?.type === "response.output_item.done") {
          const item = interno.item as Record<string, unknown> | undefined;
          if (item?.type === "function_call" && typeof item.name === "string") {
            emitir({
              toolCall: {
                functionCalls: [{
                  id: typeof item.call_id === "string" ? item.call_id : "",
                  name: item.name,
                  args: parsearArgumentos(item.arguments),
                }],
              },
            });
          }
        }
        break;
      }
      case "error": {
        const mensaje = (datosEvento.error as { message?: string } | undefined)?.message ?? "Error de GPT-Live.";
        console.error("[GPT-Live]", mensaje);
        break;
      }
      default:
        break;
    }
  };
  canal.onerror = () => {
    if (!cerrado) callbacks.onerror?.({ message: "Error en el canal de datos." } as unknown as ErrorEvent);
  };

  pc.ontrack = (evento) => {
    const flujo = evento.streams[0] ?? new MediaStream([evento.track]);
    transporte?.salida(flujo);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" && !cerrado) callbacks.onerror?.({ message: "La conexión WebRTC con GPT-Live falló." } as unknown as ErrorEvent);
  };

  if (transporte?.flujo) {
    for (const pista of transporte.flujo.getAudioTracks()) pc.addTrack(pista, transporte.flujo);
  } else {
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  const oferta = await pc.createOffer();
  await pc.setLocalDescription(oferta);
  await esperarIce(pc);
  const sdpOferta = pc.localDescription?.sdp ?? "";
  if (!datos.sesionJson) {
    cerrarTodo();
    throw new Error("Falta la configuración de la sesión GPT-Live.");
  }
  try {
    const creada = await crearSesion({ sdp: sdpOferta, sesionJson: datos.sesionJson });
    await pc.setRemoteDescription({ type: "answer", sdp: creada.sdp });
    await inicio;
  } catch (error) {
    clearTimeout(limiteInicio);
    cerrarTodo();
    throw error;
  }

  const sesion: SesionAdaptada = {
    sendRealtimeInput: (params) => {
      if (params.activityStart) silenciarEntrada(false);
      else if (params.activityEnd || params.audioStreamEnd) silenciarEntrada(true);
    },
    sendClientContent: (params) => {
      for (const turno of normalizarTurnos(params.turns)) {
        const texto = turno.parts.map((parte) => parte.text).filter((valor): valor is string => typeof valor === "string" && valor.length > 0).join(" ");
        if (texto) instruir(texto);
      }
    },
    sendToolResponse: (params) => {
      const respuestas = Array.isArray(params.functionResponses) ? params.functionResponses : [params.functionResponses];
      for (const respuesta of respuestas) {
        enviar({ type: "response.item.create", event_id: siguienteEvento("tool_output"), item: { type: "function_call_output", call_id: respuesta.id, output: JSON.stringify(respuesta.response ?? { ok: true }) } });
      }
      enviar({ type: "response.create", event_id: siguienteEvento("tool_continue") });
    },
    agregarInstruccion: instruir,
    agregarMensajeUsuario: enviarAlBackend,
    silenciarEntrada,
    close: () => {
      if (cerrado) return;
      if (abierto && iniciada) {
        cerrado = true;
        clearTimeout(temporizadorVoz);
        clearTimeout(temporizadorApoyo);
        enviar({ type: "session.close", event_id: siguienteEvento("app_close") });
        setTimeout(cerrarTodo, 1500);
        return;
      }
      cerrarTodo();
    },
  };

  return sesion as unknown as Session;
}
