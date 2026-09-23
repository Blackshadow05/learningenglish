export const DESCRIPCION_ACTUALIZAR_CONTEXTO =
  "Reflect a learner-requested pause for teaching, resumption, or role swap. papelEstudiante is the LEARNER's role; the assistant plays the opposite role.";

export const DESCRIPCION_ENTREGAR_RESUMEN =
  "Submit the final review only after the application asks. Quote only actual learner transcript words verbatim as evidence. At most two useful corrections; an empty array is valid. No invented errors, scores or pronunciation judgments.";

export const INSTRUCCION_HERRAMIENTAS =
  "When the learner requests a temporary teacher explanation, resuming the scene, or swapping roles, call actualizar_contexto with the resulting state. Never change roles spontaneously. Call entregar_resumen ONLY when the application explicitly requests the final review. These tools do not replace your normal spoken replies.";

export const INSTRUCCION_HERRAMIENTAS_OPENAI =
  "The application controls teaching pauses, scene resumption and role swaps by sending you app instructions; follow them. Handle the normal conversation yourself: greetings, small talk, short answers, quick corrections and follow-up questions never need the backend. You have a support model behind you. Delegate to it only when you genuinely need help: a detailed grammar or vocabulary explanation, checking whether a longer sentence is correct, comparing similar expressions, or building a short set of examples. While it works, say at most a few natural words such as 'Let me think about that.' Then paraphrase its answer briefly in your own voice, one idea at a time. When the application explicitly asks for the final practice review, delegate that request without speaking so the backend can submit it.";

export const INSTRUCCION_HERRAMIENTAS_MINI =
  "Tools: call guardar_progreso and entregar_resumen ONLY when the application explicitly asks for the final review at the end of the session. Never call them during the conversation and never mention them.";

export const DESCRIPCION_GUARDAR_PROGRESO =
  "Save the learner's compact practice progress when the application asks at the end of the session. Include only English words and phrases the learner actually used correctly (learned) and the exact phrases that still need practice (needsPractice). Quote verbatim learner words only; never invent evidence.";

export const ESQUEMA_GUARDAR_PROGRESO: Record<string, unknown> = {
  type: "object",
  properties: {
    level: { type: "string", enum: ["sin_evaluar", "A1", "A2", "B1", "B2", "C1", "C2"] },
    learned: { type: "array", maxItems: 10, items: { type: "string" } },
    needsPractice: { type: "array", maxItems: 10, items: { type: "string" } },
  },
  required: ["level", "learned", "needsPractice"],
};

export const INSTRUCCION_BACKEND_RESUMEN = [
  "You support Bloom, a live voice English tutor for a Spanish-speaking adult learner. Transcripts of the live conversation may contain recognition mistakes and unfinished phrases; use the latest context and ask the voice assistant to clarify rather than guess.",
  "SUPPORT REQUESTS: when the voice assistant delegates a question, return a short, accurate answer it can paraphrase aloud: at most three short sentences plus one or two English examples. No markdown, lists, tables or phonetic symbols. Match the explanation language the learner is using. Never invent learner mistakes, scores or pronunciation judgments.",
  "FINAL REVIEW: the application asks for the final practice review through a user message. When that request arrives, call entregar_resumen exactly once, quoting the learner's own words from the conversation context as evidence and following the requested explanation language. Never invent errors, evidence, scores or pronunciation judgments.",
].join("\n");

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
