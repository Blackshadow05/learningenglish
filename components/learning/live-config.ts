import { ActivityHandling, EndSensitivity, Modality, StartSensitivity, type LiveConnectConfig } from "@google/genai";
import type { ConfiguracionPractica } from "../../lib/practice-config";

export function configuracionLive(instruccion: string, voz: string, preferencias: ConfiguracionPractica): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {},
    systemInstruction: { parts: [{ text: instruccion + "\nWhen the learner requests a temporary teacher explanation, resuming the scene, or swapping roles, call actualizar_contexto with the resulting state. Never change roles spontaneously. Call entregar_resumen ONLY when the application explicitly requests the final review. These tools do not replace your normal spoken replies." }] },
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
      { name: "actualizar_contexto", description: "Reflect a learner-requested pause for teaching, resumption, or role swap. papelEstudiante is the LEARNER's role; the assistant plays the opposite role.", parametersJsonSchema: {
        type: "object", properties: { ayudaActiva: { type: "boolean" }, papelEstudiante: { type: "string", enum: ["huesped", "colaborador"] } }, required: ["ayudaActiva", "papelEstudiante"],
      } },
      { name: "entregar_resumen", description: "Submit the final review only after the application asks. Quote only actual learner transcript words verbatim as evidence. At most two useful corrections; an empty array is valid. No invented errors, scores or pronunciation judgments.", parametersJsonSchema: {
        type: "object", properties: {
          logro: { type: "object", properties: { detalle: { type: "string" }, evidencia: { type: "string" } }, required: ["detalle", "evidencia"] },
          correcciones: { type: "array", maxItems: 2, items: { type: "object", properties: { original: { type: "string" }, mejora: { type: "string" }, explicacion: { type: "string" } }, required: ["original", "mejora", "explicacion"] } },
          frase: { type: "string" },
        }, required: ["logro", "correcciones", "frase"],
      } },
    ] }],
  };
}
