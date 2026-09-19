export const DESCRIPCION_ACTUALIZAR_CONTEXTO =
  "Reflect a learner-requested pause for teaching, resumption, or role swap. papelEstudiante is the LEARNER's role; the assistant plays the opposite role.";

export const DESCRIPCION_ENTREGAR_RESUMEN =
  "Submit the final review only after the application asks. Quote only actual learner transcript words verbatim as evidence. At most two useful corrections; an empty array is valid. No invented errors, scores or pronunciation judgments.";

export const INSTRUCCION_HERRAMIENTAS =
  "When the learner requests a temporary teacher explanation, resuming the scene, or swapping roles, call actualizar_contexto with the resulting state. Never change roles spontaneously. Call entregar_resumen ONLY when the application explicitly requests the final review. These tools do not replace your normal spoken replies.";

export const INSTRUCCION_HERRAMIENTAS_OPENAI =
  "The application controls teaching pauses, scene resumption and role swaps by sending you app instructions; follow them. Handle all conversation yourself: never delegate greetings, answers, questions, corrections, hints or small talk. The backend has exactly one ability: submitting the final practice review when the application explicitly asks for it; delegate only that request, without speaking, so the backend can submit the review.";

export const INSTRUCCION_BACKEND_RESUMEN =
  "You are the backend of a spoken English practice session. The application asks for the final practice review through user messages. When that request arrives, call entregar_resumen exactly once, quoting the learner's own words from the conversation context as evidence and following the requested explanation language. Never invent errors, evidence, scores or pronunciation judgments.";

export const ESQUEMA_ACTUALIZAR_CONTEXTO: Record<string, unknown> = {
  type: "object",
  properties: {
    ayudaActiva: { type: "boolean" },
    papelEstudiante: { type: "string", enum: ["huesped", "colaborador"] },
  },
  required: ["ayudaActiva", "papelEstudiante"],
};

export const ESQUEMA_ENTREGAR_RESUMEN: Record<string, unknown> = {
  type: "object",
  properties: {
    logro: {
      type: "object",
      properties: { detalle: { type: "string" }, evidencia: { type: "string" } },
      required: ["detalle", "evidencia"],
    },
    correcciones: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          mejora: { type: "string" },
          explicacion: { type: "string" },
        },
        required: ["original", "mejora", "explicacion"],
      },
    },
    frase: { type: "string" },
  },
  required: ["logro", "correcciones", "frase"],
};
