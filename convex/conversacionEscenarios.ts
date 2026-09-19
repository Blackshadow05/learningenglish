export type EscenarioConversacion = {
  id: string;
  titulo: string;
  subtitulo: string;
  descripcion: string;
  situacion: string;
  meta: string;
  vocabularioClave: string[];
};

export const ESCENARIOS_CONVERSACION: EscenarioConversacion[] = [
  {
    id: "llegada_huesped",
    titulo: "Llegada del huésped",
    subtitulo: "Recibe y da la bienvenida en la entrada",
    descripcion:
      "El huésped acaba de llegar al hotel. Salúdalo, ofrécele ayuda y descubre si busca recepción.",
    situacion:
      "A guest has just arrived at the hotel entrance. You are the hotel staff member at the entrance and the student plays the guest.",
    meta:
      "Greet the guest, welcome them to the hotel, offer help and find out what they need.",
    vocabularioClave: [
      "Good morning",
      "Good afternoon",
      "Welcome to the hotel",
      "How can I help you?",
      "Are you looking for reception?",
      "Do you have a reservation?",
    ],
  },
  {
    id: "indicaciones_recepcion",
    titulo: "Indicaciones a recepción",
    subtitulo: "Explica cómo llegar a recepción",
    descripcion:
      "Guía al huésped hasta recepción: sigue recto, unos 200 metros y el primer edificio a la izquierda.",
    situacion:
      "The guest is looking for the reception. You give clear directions from the hotel entrance to the reception desk and answer follow-up questions.",
    meta:
      "Explain the route to reception: go straight for about 200 meters, reception is the first building on the left, the entrance is on the left.",
    vocabularioClave: [
      "Go straight",
      "about 200 meters",
      "the first building on your left",
      "Reception is straight ahead",
      "Turn left",
      "The entrance is on the left",
    ],
  },
  {
    id: "estacionamiento_transporte",
    titulo: "Estacionamiento y transporte",
    subtitulo: "Resuelve dudas de parking, taxi o shuttle",
    descripcion:
      "El huésped pregunta dónde estacionar, si puede ir caminando o cómo tomar el shuttle del hotel.",
    situacion:
      "The guest asks about parking, taxis and the hotel shuttle. You answer their questions with simple directions.",
    meta:
      "Answer questions about parking, walking, taxis and the shuttle, using location words and simple directions.",
    vocabularioClave: [
      "Where can I park?",
      "The parking lot is on your right",
      "You can walk",
      "It is very close",
      "The taxi is in front of the hotel",
      "Take the shuttle",
    ],
  },
];

export function buscarEscenario(id: string): EscenarioConversacion | undefined {
  return ESCENARIOS_CONVERSACION.find((escenario) => escenario.id === id);
}

export function construirInstruccion(
  escenario: EscenarioConversacion,
  nivel: string | null
): string {
  const nivelTexto = nivel
    ? `The student's estimated English level is ${nivel}. Adapt your vocabulary and speaking speed to that level.`
    : "The student's level is unknown. Use very simple beginner English (A1).";

  return [
    "You are the hotel entrance assistant at a hotel. You are helping a Spanish-speaking student practice conversational English.",
    `Scenario: ${escenario.situacion}`,
    `Your goal: ${escenario.meta}`,
    `Useful vocabulary for this scenario: ${escenario.vocabularioClave.join(", ")}.`,
    nivelTexto,
    "Rules:",
    "- Speak only in English, in character, with warm and professional hotel language.",
    "- Keep every reply short: one or two sentences, at most 25 words.",
    "- Ask only one question at a time and wait for the student's answer.",
    "- Open the conversation by greeting the student and offering help.",
    "- If the student makes a mistake, naturally model the correct phrase in your reply. Do not give long grammar explanations.",
    "- If the student seems lost or silent, offer one short hint with a possible answer.",
    "- Keep the conversation going for at least six exchanges when possible.",
  ].join("\n");
}
