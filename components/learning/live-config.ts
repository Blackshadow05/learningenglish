import { ActivityHandling, EndSensitivity, Modality, StartSensitivity, type LiveConnectConfig } from "@google/genai";
import type { ConfiguracionPractica } from "../../lib/practice-config";
import { DESCRIPCION_ACTUALIZAR_CONTEXTO, DESCRIPCION_ENTREGAR_RESUMEN, ESQUEMA_ACTUALIZAR_CONTEXTO, ESQUEMA_ENTREGAR_RESUMEN, INSTRUCCION_HERRAMIENTAS } from "../../lib/practice-tools";

export function configuracionLive(instruccion: string, voz: string, preferencias: ConfiguracionPractica): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {},
    systemInstruction: { parts: [{ text: instruccion + "\n" + INSTRUCCION_HERRAMIENTAS }] },
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
    realtimeInputConfig: {
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
      automaticActivityDetection: preferencias.escucha === "pulsar" ? { disabled: true } : {
        disabled: false, startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
        prefixPaddingMs: 250, silenceDurationMs: 1200,
      },
    },
    tools: [{ functionDeclarations: [
      { name: "actualizar_contexto", description: DESCRIPCION_ACTUALIZAR_CONTEXTO, parametersJsonSchema: ESQUEMA_ACTUALIZAR_CONTEXTO },
      { name: "entregar_resumen", description: DESCRIPCION_ENTREGAR_RESUMEN, parametersJsonSchema: ESQUEMA_ENTREGAR_RESUMEN },
    ] }],
  };
}
