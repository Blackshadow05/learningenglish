"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { api } from "../../convex/_generated/api";

export type EstadoConversacion =
  | "inactivo"
  | "conectando"
  | "en_vivo"
  | "finalizada"
  | "error";

export type MensajeConversacion = {
  id: number;
  rol: "estudiante" | "tutor";
  texto: string;
};

const CODIGO_WORKLET = `
class CapturaPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pendientes = [];
    this.total = 0;
  }
  process(inputs) {
    const entrada = inputs[0];
    const canal = entrada && entrada[0];
    if (canal && canal.length) {
      this.pendientes.push(canal.slice(0));
      this.total += canal.length;
      if (this.total >= 2048) {
        const unido = new Float32Array(this.total);
        let offset = 0;
        for (const bloque of this.pendientes) {
          unido.set(bloque, offset);
          offset += bloque.length;
        }
        this.port.postMessage(unido, [unido.buffer]);
        this.pendientes = [];
        this.total = 0;
      }
    }
    return true;
  }
}
registerProcessor("captura-pcm", CapturaPcm);
`;

function float32APcm16Base64(muestras: Float32Array): string {
  const buffer = new ArrayBuffer(muestras.length * 2);
  const vista = new DataView(buffer);
  for (let indice = 0; indice < muestras.length; indice += 1) {
    const valor = Math.max(-1, Math.min(1, muestras[indice]));
    vista.setInt16(
      indice * 2,
      valor < 0 ? valor * 0x8000 : valor * 0x7fff,
      true
    );
  }
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (let indice = 0; indice < bytes.length; indice += 1) {
    binario += String.fromCharCode(bytes[indice]);
  }
  return btoa(binario);
}

function pcm16Base64AFloat32(base64: string): Float32Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let indice = 0; indice < binario.length; indice += 1) {
    bytes[indice] = binario.charCodeAt(indice);
  }
  const vista = new DataView(bytes.buffer);
  const muestras = new Float32Array(bytes.length / 2);
  for (let indice = 0; indice < muestras.length; indice += 1) {
    muestras[indice] = vista.getInt16(indice * 2, true) / 32768;
  }
  return muestras;
}

const nivelesValidos = ["sin_evaluar", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
type NivelCefr = (typeof nivelesValidos)[number];

function normalizarNivel(nivel: string | null): NivelCefr | null {
  if (!nivel) return null;
  return (nivelesValidos as readonly string[]).includes(nivel)
    ? (nivel as NivelCefr)
    : null;
}

export function useConversacionEnVivo() {
  const crearToken = useAction(api.conversacion.crearTokenLive);
  const [estado, setEstado] = useState<EstadoConversacion>("inactivo");
  const [mensajes, setMensajes] = useState<MensajeConversacion[]>([]);
  const [error, setError] = useState("");
  const [micActivo, setMicActivo] = useState(false);
  const [micError, setMicError] = useState("");
  const [micSilenciado, setMicSilenciado] = useState(false);
  const [tutorHablando, setTutorHablando] = useState(false);
  const idMensaje = useRef(0);
  const recursos = useRef({
    sesion: null as Session | null,
    conectado: false,
    silenciado: false,
    captura: null as AudioContext | null,
    reproduccion: null as AudioContext | null,
    flujo: null as MediaStream | null,
    fuentes: new Set<AudioBufferSourceNode>(),
    proximoInicio: 0,
  });

  function agregarTranscripcion(
    rol: MensajeConversacion["rol"],
    fragmento: string
  ) {
    setMensajes((actuales) => {
      const ultimo = actuales[actuales.length - 1];
      if (ultimo && ultimo.rol === rol) {
        return [
          ...actuales.slice(0, -1),
          { ...ultimo, texto: `${ultimo.texto}${fragmento}` },
        ];
      }
      idMensaje.current += 1;
      return [...actuales, { id: idMensaje.current, rol, texto: fragmento }];
    });
  }

  function interrumpirAudio() {
    const r = recursos.current;
    for (const fuente of r.fuentes) {
      try {
        fuente.stop();
      } catch {
        continue;
      }
    }
    r.fuentes.clear();
    if (r.reproduccion) r.proximoInicio = r.reproduccion.currentTime;
    setTutorHablando(false);
  }

  function reproducirAudio(base64: string) {
    const r = recursos.current;
    const contexto = r.reproduccion;
    if (!contexto) return;
    const muestras = pcm16Base64AFloat32(base64);
    if (!muestras.length) return;
    const buffer = contexto.createBuffer(1, muestras.length, 24000);
    buffer.getChannelData(0).set(muestras);
    const fuente = contexto.createBufferSource();
    fuente.buffer = buffer;
    fuente.connect(contexto.destination);
    const inicio = Math.max(contexto.currentTime + 0.05, r.proximoInicio);
    fuente.start(inicio);
    r.proximoInicio = inicio + buffer.duration;
    r.fuentes.add(fuente);
    fuente.onended = () => r.fuentes.delete(fuente);
    setTutorHablando(true);
  }

  function manejarMensaje(mensaje: LiveServerMessage) {
    const contenido = mensaje.serverContent;
    if (!contenido) return;
    if (contenido.interrupted) interrumpirAudio();
    const partes = contenido.modelTurn?.parts;
    if (partes) {
      for (const parte of partes) {
        if (parte.inlineData?.data) reproducirAudio(parte.inlineData.data);
      }
    }
    if (contenido.inputTranscription?.text) {
      agregarTranscripcion("estudiante", contenido.inputTranscription.text);
    }
    if (contenido.outputTranscription?.text) {
      agregarTranscripcion("tutor", contenido.outputTranscription.text);
    }
    if (contenido.turnComplete) setTutorHablando(false);
  }

  async function activarMicrofono() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicActivo(false);
      setMicError(
        "Este navegador bloquea el micrófono porque la página no es segura. La voz necesita HTTPS o localhost; en el móvil entra por localhost o por una dirección https."
      );
      return;
    }
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const contexto = new AudioContext({ sampleRate: 16000 });
      const url = URL.createObjectURL(
        new Blob([CODIGO_WORKLET], { type: "application/javascript" })
      );
      await contexto.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      void contexto.resume();
      const fuente = contexto.createMediaStreamSource(flujo);
      const nodo = new AudioWorkletNode(contexto, "captura-pcm");
      nodo.port.onmessage = (evento: MessageEvent<Float32Array>) => {
        const sesion = recursos.current.sesion;
        if (!sesion || !recursos.current.conectado) return;
        if (recursos.current.silenciado) return;
        sesion.sendRealtimeInput({
          audio: {
            data: float32APcm16Base64(evento.data),
            mimeType: "audio/pcm;rate=16000",
          },
        });
      };
      fuente.connect(nodo);
      nodo.connect(contexto.destination);
      recursos.current.flujo = flujo;
      recursos.current.captura = contexto;
      setMicActivo(true);
      setMicError("");
    } catch {
      setMicActivo(false);
      setMicError(
        "No pudimos acceder a tu micrófono. Revisa el permiso del navegador o escríbele al tutor mientras tanto."
      );
    }
  }

  function detenerAudio() {
    const r = recursos.current;
    for (const fuente of r.fuentes) {
      try {
        fuente.stop();
      } catch {
        continue;
      }
    }
    r.fuentes.clear();
    r.flujo?.getTracks().forEach((pista) => pista.stop());
    r.flujo = null;
    if (r.captura) {
      void r.captura.close();
      r.captura = null;
    }
    if (r.reproduccion) {
      void r.reproduccion.close();
      r.reproduccion = null;
    }
    setMicActivo(false);
    setTutorHablando(false);
  }

  function finalizar() {
    recursos.current.sesion?.close();
    recursos.current.sesion = null;
    recursos.current.conectado = false;
    detenerAudio();
    setEstado((actual) => (actual === "error" ? actual : "finalizada"));
  }

  function alternarMicrofono() {
    recursos.current.silenciado = !recursos.current.silenciado;
    setMicSilenciado(recursos.current.silenciado);
  }

  async function iniciar(escenarioId: string, nivel: string | null) {
    if (recursos.current.sesion) finalizar();
    setMensajes([]);
    setError("");
    setEstado("conectando");
    setTutorHablando(false);
    setMicActivo(false);
    setMicError("");
    recursos.current.silenciado = false;
    setMicSilenciado(false);
    const promesaMicrofono = activarMicrofono();
    try {
      const reproduccion = new AudioContext({ sampleRate: 24000 });
      recursos.current.reproduccion = reproduccion;
      recursos.current.proximoInicio = reproduccion.currentTime;
      void reproduccion.resume();
      const datos = await crearToken({
        escenarioId,
        nivel: normalizarNivel(nivel),
      });
      const cliente = new GoogleGenAI({
        apiKey: datos.token,
        apiVersion: "v1alpha",
      });
      const sesion = await cliente.live.connect({
        model: datos.modelo,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: { parts: [{ text: datos.instruccion }] },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: datos.voz } },
          },
        },
        callbacks: {
          onopen: () => {
            recursos.current.conectado = true;
            void recursos.current.reproduccion?.resume();
            setEstado("en_vivo");
          },
          onmessage: manejarMensaje,
          onerror: () => {
            setError(
              "Se interrumpió la conexión con Gemini. Inténtalo de nuevo."
            );
            setEstado("error");
          },
          onclose: () => {
            if (recursos.current.conectado) {
              recursos.current.conectado = false;
              setEstado("finalizada");
            }
          },
        },
      });
      recursos.current.sesion = sesion;
      await promesaMicrofono;
    } catch (err) {
      recursos.current.sesion = null;
      recursos.current.conectado = false;
      detenerAudio();
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar la conversación."
      );
      setEstado("error");
    }
  }

  function enviarTexto(texto: string) {
    const limpio = texto.trim();
    const sesion = recursos.current.sesion;
    if (!limpio || !sesion) return;
    sesion.sendClientContent({
      turns: [{ role: "user", parts: [{ text: limpio }] }],
      turnComplete: true,
    });
    agregarTranscripcion("estudiante", limpio);
    setTutorHablando(true);
  }

  useEffect(() => {
    const r = recursos.current;
    return () => {
      r.sesion?.close();
      r.sesion = null;
      r.conectado = false;
      for (const fuente of r.fuentes) {
        try {
          fuente.stop();
        } catch {
          continue;
        }
      }
      r.fuentes.clear();
      r.flujo?.getTracks().forEach((pista) => pista.stop());
      r.flujo = null;
      if (r.captura) void r.captura.close();
      if (r.reproduccion) void r.reproduccion.close();
    };
  }, []);

  return {
    estado,
    mensajes,
    error,
    micActivo,
    micError,
    micSilenciado,
    tutorHablando,
    iniciar,
    finalizar,
    enviarTexto,
    alternarMicrofono,
  };
}
