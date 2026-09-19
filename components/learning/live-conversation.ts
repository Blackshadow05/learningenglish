"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAction } from "convex/react";
import { ActivityHandling, EndSensitivity, GoogleGenAI, Modality, StartSensitivity } from "@google/genai";
import { api } from "../../convex/_generated/api";
import { ConversacionLive } from "./live-session";

export function useConversacionEnVivo() {
  const crearToken = useAction(api.conversacion.crearTokenLive);
  const [conversacion] = useState(() => new ConversacionLive({
    crearToken,
    conectar: (datos, callbacks) => new GoogleGenAI({
      apiKey: datos.token,
      apiVersion: "v1alpha",
    }).live.connect({
      model: datos.modelo,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: { parts: [{ text: datos.instruccion }] },
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: datos.voz } } },
        realtimeInputConfig: {
          activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 100,
            silenceDurationMs: 800,
          },
        },
      },
      callbacks,
    }),
  }));
  const snapshot = useSyncExternalStore(conversacion.subscribe, conversacion.getSnapshot, conversacion.getSnapshot);

  useEffect(() => {
    const salir = () => conversacion.finalizar();
    window.addEventListener("pagehide", salir);
    return () => {
      window.removeEventListener("pagehide", salir);
      conversacion.finalizar();
    };
  }, [conversacion]);

  return {
    ...snapshot,
    niveles: conversacion.niveles,
    iniciar: conversacion.iniciar,
    finalizar: conversacion.finalizar,
    enviarTexto: conversacion.enviarTexto,
    silenciar: conversacion.silenciar,
  };
}
