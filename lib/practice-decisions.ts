import type { ConfiguracionPractica } from "./practice-config";

export const COMPRENSIONES = ["entendio", "parcial", "no_entendio", "incierto"] as const;
export const PASOS = ["seguir", "simplificar", "explicar", "practicar", "ampliar", "nuevo_tema", "animar"] as const;
export const IDIOMAS_TUTOR = ["ingles", "ingles_simple", "espanol_breve", "espanol_explicacion"] as const;
export const ERRORES = ["ninguno", "verbos", "concordancia", "orden", "vocabulario", "preposiciones"] as const;
export const ANIMOS = ["comodo", "inseguro", "frustrado", "aburrido"] as const;
export const PETICIONES = ["ninguna", "repetir", "mas_despacio", "explicacion", "traducir", "cambiar_tema", "retomar"] as const;
export const NIVELES_CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const VOCES_AUTOMATICAS = ["mini", "openai"] as const;

export type Comprension = (typeof COMPRENSIONES)[number];
export type PasoSiguiente = (typeof PASOS)[number];
export type IdiomaTutor = (typeof IDIOMAS_TUTOR)[number];
export type TipoError = (typeof ERRORES)[number];
export type Animo = (typeof ANIMOS)[number];
export type Peticion = (typeof PETICIONES)[number];
export type NivelCefr = (typeof NIVELES_CEFR)[number];
export type NivelPerfil = "sin_evaluar" | NivelCefr;
export type VozAutomatica = (typeof VOCES_AUTOMATICAS)[number];
type Dificultad = Exclude<TipoError, "ninguno">;

export type Eleccion<T extends string> = { valor: T; probabilidad: number; distribucion: Partial<Record<T, number>> };
export type DecisionTurno = {
  comprension: Eleccion<Comprension>;
  paso: Eleccion<PasoSiguiente>;
  idioma: Eleccion<IdiomaTutor>;
  error: Eleccion<TipoError>;
  animo: Eleccion<Animo>;
  peticion: Eleccion<Peticion>;
  nivel: { valor: number; confianza: number } | null;
  tutorResolvio: number | null;
};
export type EntradaDecision = { rol: "estudiante" | "tutor"; texto: string };
export type ContextoDecision = {
  turnosTema: number;
  noEntiende: number;
  errores: string[];
  ayudaActiva: boolean;
  papel: "huesped" | "colaborador";
};
export type SolicitudDecision = {
  escenarioId: string;
  configuracion: ConfiguracionPractica;
  historial: EntradaDecision[];
  contexto: ContextoDecision;
};
export type EscenarioDecision = { titulo: string; descripcion: string };

type Opcion = { value: string; description: string };
export type PreguntaDecision =
  | { type: "predicate"; name: string; instructions: string }
  | { type: "choice"; name: string; instructions: string; choices: Opcion[] }
  | { type: "score"; name: string; instructions: string; levels: { label: string; description: string }[] };

const DESCRIPCION_COMPRENSION: Record<Comprension, string> = {
  entendio: "Yes: the learner's latest turn answers or follows up on that tutor message in a sensible way.",
  parcial: "Partly: the learner follows most of it but asks about one word or phrase, guesses, or answers only part of it.",
  no_entendio: "No: the learner says they do not understand (in English or Spanish), asks for a repetition or a translation of the whole message, or answers something unrelated.",
  incierto: "Cannot tell: the learner's latest turn is only a greeting, filler or an unintelligible fragment, or there is no tutor message before it.",
};

const DESCRIPCION_PASO: Record<PasoSiguiente, string> = {
  seguir: "Keep the conversation flowing on the same topic; the learner is coping well.",
  simplificar: "Say it again more simply: shorter sentences, common words, one idea at a time.",
  explicar: "Briefly teach the word, phrase or grammar point the learner is missing or asked about, with one example, then return to speaking practice.",
  practicar: "Have the learner say a useful phrase or correction again, or reuse it in a new sentence right away.",
  ampliar: "Raise the challenge a little: open questions that need longer answers, new vocabulary or a richer structure.",
  nuevo_tema: "Move on: the topic or step is exhausted, the goal is met, or the learner wants or needs something new.",
  animar: "Lower the pressure: the learner is blocked, anxious or frustrated; reassure them and give an easy way to answer.",
};

const DESCRIPCION_IDIOMA: Record<IdiomaTutor, string> = {
  ingles: "Normal English: the learner is following.",
  ingles_simple: "Very simple, slower English: the learner follows with effort.",
  espanol_breve: "One short Spanish clarification of a key word or phrase, then back to English.",
  espanol_explicacion: "A short explanation in Spanish with English examples: the learner is lost, or asked for an explanation or a translation.",
};

const DESCRIPCION_ERROR: Record<Dificultad, string> = {
  verbos: "Verb tense or verb form, for example 'I go yesterday' or 'he have'.",
  concordancia: "Agreement or auxiliaries: do/does, plurals, a missing subject or auxiliary, for example 'she don't' or 'is very nice'.",
  orden: "Word order or question formation, for example 'what you want?' or 'a car red'.",
  vocabulario: "Wrong word, false friend, or a Spanish word used instead of an English one.",
  preposiciones: "Prepositions or articles, for example 'in Monday' or 'I am engineer'.",
};

const DESCRIPCION_ANIMO: Record<Animo, string> = {
  comodo: "Relaxed or engaged.",
  inseguro: "Hesitant or insecure: apologizes, gives very short answers, or asks whether they are right.",
  frustrado: "Frustrated: says it is too hard, gives up or complains.",
  aburrido: "Disengaged: flat minimal answers, or wants to talk about something else.",
};

const DESCRIPCION_PETICION: Record<Peticion, string> = {
  ninguna: "The learner only answers or comments; they ask the tutor for nothing.",
  repetir: "Asks the tutor to repeat or say it again, for example 'can you repeat?' or 'otra vez, por favor'.",
  mas_despacio: "Asks the tutor to speak more slowly.",
  explicacion: "Asks what a word or phrase means ('what is memorable?', '¿qué significa...?'), how to say something, or for a grammar explanation, without asking for Spanish.",
  traducir: "Asks the tutor to explain or translate in Spanish, for example '¿me lo explicas en español?' or 'en español, por favor'.",
  cambiar_tema: "Asks to talk about something else or to change the activity.",
  retomar: "Asks to go back to the conversation or role-play after an explanation.",
};

const DESCRIPCION_NIVEL: Record<NivelCefr, string> = {
  A1: "Isolated words and memorized phrases; very simple present.",
  A2: "Short simple sentences about familiar things; frequent basic errors.",
  B1: "Connected sentences on familiar topics; can describe and explain with some errors.",
  B2: "Clear, detailed speech on many topics; errors rarely block meaning.",
  C1: "Fluent, flexible and precise; complex structures with few errors.",
  C2: "Near-native precision and nuance.",
};

const DESCRIPCION_VOZ: Record<VozAutomatica, string> = {
  mini: "Everyday speaking practice is enough: free conversation, common role-plays, short answers and quick corrections. It is the cheaper voice, so prefer it whenever it is enough.",
  openai: "The session clearly needs in-depth teaching: detailed grammar or vocabulary explanations, comparing similar structures, exam preparation or a complex professional topic.",
};

const DIFICULTAD: Record<Dificultad, string> = {
  verbos: "verb tenses and verb forms",
  concordancia: "agreement and auxiliaries (do/does, plurals)",
  orden: "word order and question formation",
  vocabulario: "word choice and false friends",
  preposiciones: "prepositions and articles",
};

const NOMBRE_MODO: Record<ConfiguracionPractica["modo"], string> = {
  profesor: "teacher lesson", libre: "free conversation", simulacion: "role-play",
};

const NOMBRE_CORRECCIONES: Record<ConfiguracionPractica["correcciones"], string> = {
  durante: "during the conversation", al_final: "only in the final review", a_peticion: "only when the learner asks",
};

function opciones<T extends string>(descripciones: Record<T, string>): Opcion[] {
  return Object.entries<string>(descripciones).map(([value, description]) => ({ value, description }));
}

export function preguntasTurno(configuracion: ConfiguracionPractica): PreguntaDecision[] {
  const idiomas: Partial<Record<IdiomaTutor, string>> = configuracion.idiomaAyuda === "espanol"
    ? DESCRIPCION_IDIOMA
    : { ingles: DESCRIPCION_IDIOMA.ingles, ingles_simple: DESCRIPCION_IDIOMA.ingles_simple };
  return [
    { type: "choice", name: "comprension", instructions: "Compare the learner's latest turn with the tutor message before it. Did the learner understand that tutor message?", choices: opciones(DESCRIPCION_COMPRENSION) },
    { type: "choice", name: "paso", instructions: "What should the tutor's next reply do to make this speaking practice most effective? Take into account what the tutor reply after the learner's latest turn already did.", choices: opciones(DESCRIPCION_PASO) },
    { type: "choice", name: "idioma", instructions: "Which language should the tutor use in its next reply so the learner keeps speaking English while still understanding? Prefer English; choose Spanish only when it clearly helps.", choices: opciones(idiomas as Record<IdiomaTutor, string>) },
    { type: "predicate", name: "hay_error", instructions: "Does the learner's latest turn contain at least one clear English mistake in verb tense or form, agreement, word order, prepositions, articles or word choice? A wrong tense counts even when the meaning is clear. Ignore hesitations, filler words, self-corrections, unfinished sentences and Spanish used on purpose to ask for help." },
    { type: "choice", name: "tipo_error", instructions: "Assume the learner's latest turn has an English mistake. Which kind is the most important one?", choices: opciones(DESCRIPCION_ERROR) },
    { type: "score", name: "nivel", instructions: "Which CEFR speaking level does the learner show across all of their turns? Judge only the learner's own English, never the tutor's.", levels: NIVELES_CEFR.map((label) => ({ label, description: DESCRIPCION_NIVEL[label] })) },
    { type: "choice", name: "animo", instructions: "How does the learner seem to feel in their latest turns?", choices: opciones(DESCRIPCION_ANIMO) },
    { type: "choice", name: "peticion", instructions: "Does the learner's latest turn ask the tutor to do something, in English or Spanish? A question about what a word means counts as asking for an explanation.", choices: opciones(DESCRIPCION_PETICION) },
    { type: "predicate", name: "tutor_resolvio", instructions: "Did the tutor reply after the learner's latest turn give the learner what they needed? True if it answered their request or cleared up their confusion, or if the learner needed nothing special and the reply simply continued well. False if the learner asked for something or was confused and the reply ignored it, if they asked for Spanish and the reply stayed in English, if they asked to change the topic and the reply kept the old one, or if there is no tutor reply yet." },
  ];
}

function limpiar(texto: string) {
  return texto.replace(/\s+/g, " ").trim();
}

export function entradaTurno(configuracion: ConfiguracionPractica, historial: EntradaDecision[], contexto: ContextoDecision, escenario?: EscenarioDecision): string {
  const ajustes = [
    `mode: ${NOMBRE_MODO[configuracion.modo]}`,
    configuracion.modo === "simulacion" ? `the learner plays the ${contexto.papel === "huesped" ? "hotel guest" : "hotel staff member"} and the tutor plays the other role` : "",
    escenario ? `situation: ${escenario.titulo}` : "",
    configuracion.tema.trim() ? `learner topic: ${JSON.stringify(limpiar(configuracion.tema))}` : "",
    `corrections: ${NOMBRE_CORRECCIONES[configuracion.correcciones]}`,
    `explanation language chosen by the learner: ${configuracion.idiomaAyuda === "espanol" ? "Spanish" : "English"}`,
  ].filter(Boolean);
  const estado = [
    `learner turns on the current topic: ${contexto.turnosTema}`,
    `comprehension problems in a row: ${contexto.noEntiende}`,
    contexto.errores.length ? `recurring difficulties: ${contexto.errores.join(", ")}` : "",
    contexto.ayudaActiva ? "the tutor is in a short teaching pause" : "",
  ].filter(Boolean);
  const posicion = historial.map((entrada) => entrada.rol).lastIndexOf("estudiante");
  const anterior = historial.slice(0, Math.max(posicion, 0)).filter((entrada) => entrada.rol === "tutor").at(-1);
  const respuesta = posicion < 0 ? undefined : historial.slice(posicion + 1).find((entrada) => entrada.rol === "tutor");
  const cita = (entrada?: EntradaDecision) => (entrada ? JSON.stringify(limpiar(entrada.texto)) : "(none)");
  return [
    "Live spoken English practice between Bloom, an AI voice tutor, and a Spanish-speaking adult learner. Transcripts come from speech recognition and may contain recognition mistakes.",
    `Settings: ${ajustes.join("; ")}.`,
    `App state: ${estado.join("; ")}.`,
    "Conversation so far, oldest first:",
    ...historial.map((entrada) => `${entrada.rol === "tutor" ? "Tutor" : "Learner"}: ${limpiar(entrada.texto)}`),
    "Focus for the questions:",
    `- Tutor message before the learner's latest turn: ${cita(anterior)}`,
    `- Learner's latest turn: ${cita(posicion < 0 ? undefined : historial[posicion])}`,
    `- Tutor reply after the learner's latest turn: ${respuesta ? cita(respuesta) : "(none yet)"}`,
  ].join("\n");
}

type Respuesta = Record<string, unknown>;

function indexar(datos: unknown): Map<string, Respuesta> {
  const mapa = new Map<string, Respuesta>();
  const lista = datos && typeof datos === "object" ? (datos as { answers?: unknown }).answers : null;
  if (!Array.isArray(lista)) return mapa;
  for (const elemento of lista) {
    if (elemento && typeof elemento === "object" && typeof (elemento as Respuesta).name === "string") {
      mapa.set((elemento as Respuesta).name as string, elemento as Respuesta);
    }
  }
  return mapa;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function leerEleccion<T extends string>(respuesta: Respuesta | undefined, valores: readonly T[], defecto: T): Eleccion<T> {
  const valor = valores.find((opcion) => opcion === respuesta?.choice);
  if (!respuesta || !valor) return { valor: defecto, probabilidad: 0, distribucion: {} };
  const distribucion: Partial<Record<T, number>> = {};
  const filas = Array.isArray(respuesta.probabilities) ? (respuesta.probabilities as unknown[]) : [];
  for (const item of filas) {
    if (!item || typeof item !== "object") continue;
    const opcion = valores.find((candidata) => candidata === (item as Respuesta).value);
    const probabilidad = numero((item as Respuesta).probability);
    if (opcion && probabilidad !== null) distribucion[opcion] = probabilidad;
  }
  return { valor, probabilidad: distribucion[valor] ?? numero(respuesta.confidence) ?? 0, distribucion };
}

function leerError(hayError: Respuesta | undefined, tipo: Respuesta | undefined): Eleccion<TipoError> {
  const probabilidadError = numero(hayError?.probability) ?? 0;
  const tipos = leerEleccion(tipo, ERRORES.filter((valor): valor is Dificultad => valor !== "ninguno"), "vocabulario");
  const distribucion: Partial<Record<TipoError, number>> = { ninguno: 1 - probabilidadError };
  for (const [valor, probabilidad] of Object.entries(tipos.distribucion) as [Dificultad, number][]) {
    distribucion[valor] = probabilidadError * probabilidad;
  }
  if (!Object.keys(tipos.distribucion).length) distribucion[tipos.valor] = probabilidadError;
  const valor = probabilidadError >= 0.5 ? tipos.valor : "ninguno";
  return { valor, probabilidad: distribucion[valor] ?? 0, distribucion };
}

export function leerDecisionTurno(datos: unknown): DecisionTurno | null {
  const respuestas = indexar(datos);
  if (!respuestas.size) return null;
  const nivel = numero(respuestas.get("nivel")?.score);
  return {
    comprension: leerEleccion(respuestas.get("comprension"), COMPRENSIONES, "incierto"),
    paso: leerEleccion(respuestas.get("paso"), PASOS, "seguir"),
    idioma: leerEleccion(respuestas.get("idioma"), IDIOMAS_TUTOR, "ingles"),
    error: leerError(respuestas.get("hay_error"), respuestas.get("tipo_error")),
    animo: leerEleccion(respuestas.get("animo"), ANIMOS, "comodo"),
    peticion: leerEleccion(respuestas.get("peticion"), PETICIONES, "ninguna"),
    nivel: nivel === null ? null : { valor: Math.min(5, Math.max(0, nivel)), confianza: numero(respuestas.get("nivel")?.confidence) ?? 0 },
    tutorResolvio: numero(respuestas.get("tutor_resolvio")?.probability),
  };
}

export function preguntaVoz(): PreguntaDecision {
  return { type: "choice", name: "voz", instructions: "Which voice tutor should run this English speaking session?", choices: opciones(DESCRIPCION_VOZ) };
}

export function entradaVoz(configuracion: ConfiguracionPractica, nivel: NivelPerfil | null, escenario: EscenarioDecision | undefined, memoria: string): string {
  return [
    "A Spanish-speaking adult is starting a live English speaking session with Bloom, an AI voice tutor.",
    `Mode: ${NOMBRE_MODO[configuracion.modo]}. Corrections: ${NOMBRE_CORRECCIONES[configuracion.correcciones]}. Explanation language: ${configuracion.idiomaAyuda === "espanol" ? "Spanish" : "English"}.`,
    configuracion.modo === "simulacion" && escenario ? `Situation: ${escenario.titulo}. ${escenario.descripcion}` : "",
    configuracion.tema.trim() ? `Learner topic or goal: ${JSON.stringify(limpiar(configuracion.tema))}.` : "No topic chosen.",
    `Learner level: ${nivel && nivel !== "sin_evaluar" ? nivel : "unknown"}.`,
    memoria ? `Learner memory from earlier sessions: ${memoria}` : "",
  ].filter(Boolean).join("\n");
}

export function leerVoz(datos: unknown): VozAutomatica | null {
  const respuesta = indexar(datos).get("voz");
  if (!respuesta) return null;
  const eleccion = leerEleccion(respuesta, VOCES_AUTOMATICAS, "mini");
  return eleccion.valor === "openai" && eleccion.probabilidad < 0.6 ? "mini" : eleccion.valor;
}

export function vozPorDefecto(configuracion: ConfiguracionPractica): VozAutomatica {
  return configuracion.modo === "profesor" && configuracion.tema.trim() ? "openai" : "mini";
}

export type EstadoPedagogico = {
  evaluaciones: number;
  nivel: number | null;
  errores: Partial<Record<Dificultad, number>>;
  ultimaCorreccion: number;
  ultimaIntervencion: number;
  noEntiende: number;
  fluidas: number;
  respuestasCortas: number;
  turnosTema: number;
  espanolSeguido: number;
  ultimaGuia: string;
};

export const ESTADO_PEDAGOGICO_INICIAL: EstadoPedagogico = {
  evaluaciones: 0, nivel: null, errores: {}, ultimaCorreccion: -10, ultimaIntervencion: -10,
  noEntiende: 0, fluidas: 0, respuestasCortas: 0, turnosTema: 0, espanolSeguido: 0, ultimaGuia: "",
};

export type ContextoGuia = {
  configuracion: ConfiguracionPractica;
  ayudaActiva: boolean;
  tutorRespondio: boolean;
  palabrasUltimoTurno: number;
  palabrasEstudiante: number;
  palabrasTutor: number;
};

export type PlanGuia = {
  estado: EstadoPedagogico;
  guia: string;
  intervencion: string;
  ayudaActiva?: boolean;
  enfoque: string | null;
};

const ENCABEZADO_GUIA = "Teaching note from the Bloom app for your next replies. It is silent context: never read it aloud, quote it or mention it. It replaces earlier teaching notes.";
const GUIA_NEUTRA = `${ENCABEZADO_GUIA}\n- No special adjustment now: keep the conversation natural, in English, at the learner's pace.`;

export function etiquetaNivel(estado: EstadoPedagogico): NivelCefr | null {
  return estado.nivel === null ? null : NIVELES_CEFR[Math.round(Math.min(5, Math.max(0, estado.nivel)))];
}

function dificultades(estado: EstadoPedagogico, maximo = 3): [Dificultad, number][] {
  return (Object.entries(estado.errores) as [Dificultad, number][])
    .filter(([, veces]) => veces > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maximo);
}

export function contextoDecision(estado: EstadoPedagogico, ayudaActiva: boolean, papel: "huesped" | "colaborador"): ContextoDecision {
  return {
    turnosTema: estado.turnosTema,
    noEntiende: estado.noEntiende,
    errores: dificultades(estado).map(([tipo]) => DIFICULTAD[tipo]),
    ayudaActiva,
    papel,
  };
}

export function planificarGuia(decision: DecisionTurno, previo: EstadoPedagogico, contexto: ContextoGuia): PlanGuia {
  const { configuracion } = contexto;
  const estado: EstadoPedagogico = { ...previo, errores: { ...previo.errores }, evaluaciones: previo.evaluaciones + 1 };
  const turno = estado.evaluaciones;
  const confiable = <T extends string>(eleccion: Eleccion<T>, minimo: number) => (eleccion.probabilidad >= minimo ? eleccion.valor : null);
  const probabilidad = <T extends string>(eleccion: Eleccion<T>, ...valores: T[]) =>
    valores.reduce((suma, valor) => suma + (eleccion.distribucion[valor] ?? (eleccion.valor === valor ? eleccion.probabilidad : 0)), 0);
  const masProbable = <T extends string>(eleccion: Eleccion<T>, excluido: T) =>
    (Object.entries(eleccion.distribucion) as [T, number][])
      .filter(([valor]) => valor !== excluido)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? (eleccion.valor !== excluido ? eleccion.valor : null);

  if (decision.nivel && decision.nivel.confianza >= 0.3 && contexto.palabrasEstudiante >= 8) {
    estado.nivel = estado.nivel === null ? decision.nivel.valor : estado.nivel * 0.7 + decision.nivel.valor * 0.3;
  }
  const problema = probabilidad(decision.comprension, "parcial", "no_entendio") >= 0.5;
  const perdido = probabilidad(decision.comprension, "no_entendio") >= 0.5;
  const entendio = probabilidad(decision.comprension, "entendio") >= 0.5;
  let peticion: Peticion = confiable(decision.peticion, 0.5) ?? "ninguna";
  if (peticion === "ninguna" && probabilidad(decision.peticion, "explicacion", "traducir") >= 0.45) {
    peticion = probabilidad(decision.peticion, "traducir") > probabilidad(decision.peticion, "explicacion") ? "traducir" : "explicacion";
  }
  const animo = confiable(decision.animo, 0.6) ?? "comodo";
  const candidato = 1 - probabilidad(decision.error, "ninguno") >= 0.55 ? masProbable(decision.error, "ninguno") : null;
  const tipoError: Dificultad | null = candidato && candidato !== "ninguno" ? candidato : null;
  estado.noEntiende = problema ? estado.noEntiende + 1 : entendio ? 0 : estado.noEntiende;
  estado.respuestasCortas = !problema && contexto.palabrasUltimoTurno <= 3 ? estado.respuestasCortas + 1 : 0;
  estado.fluidas = entendio && animo === "comodo" && !tipoError ? estado.fluidas + 1 : 0;
  if (tipoError) estado.errores[tipoError] = (estado.errores[tipoError] ?? 0) + 1;

  const permiteEspanol = configuracion.idiomaAyuda === "espanol" || peticion === "traducir";
  const espanolBreve = probabilidad(decision.idioma, "espanol_breve");
  const espanolExplicacion = probabilidad(decision.idioma, "espanol_explicacion");
  let idioma: IdiomaTutor = espanolBreve + espanolExplicacion >= 0.5
    ? (espanolExplicacion > espanolBreve ? "espanol_explicacion" : "espanol_breve")
    : probabilidad(decision.idioma, "ingles_simple") > probabilidad(decision.idioma, "ingles") ? "ingles_simple" : "ingles";
  if (peticion === "traducir" || estado.noEntiende >= 2) idioma = "espanol_explicacion";
  if (!permiteEspanol && (idioma === "espanol_breve" || idioma === "espanol_explicacion")) idioma = problema ? "ingles_simple" : "ingles";
  if ((idioma === "espanol_breve" || idioma === "espanol_explicacion") && estado.espanolSeguido >= 2 && !problema && peticion !== "traducir") idioma = "ingles_simple";
  const espanol = idioma === "espanol_breve" || idioma === "espanol_explicacion";
  const volverIngles = previo.espanolSeguido > 0 && !espanol;
  estado.espanolSeguido = espanol ? estado.espanolSeguido + 1 : 0;

  let paso: PasoSiguiente = confiable(decision.paso, 0.35) ?? "seguir";
  if (peticion === "cambiar_tema") paso = "nuevo_tema";
  else if (peticion === "explicacion" || peticion === "traducir") paso = "explicar";
  else if (problema && (paso === "seguir" || paso === "ampliar" || paso === "nuevo_tema" || paso === "simplificar")) paso = estado.noEntiende >= 2 ? "explicar" : "simplificar";
  if (paso === "ampliar" && (animo === "inseguro" || animo === "frustrado")) paso = "animar";
  if (paso === "seguir" && animo === "aburrido") paso = "nuevo_tema";
  if (paso === "seguir" && estado.fluidas >= 4) {
    paso = "ampliar";
    estado.fluidas = 0;
  }
  estado.turnosTema = paso === "nuevo_tema" ? 0 : estado.turnosTema + 1;

  const textoIdioma: Record<IdiomaTutor, string> = {
    ingles: volverIngles ? "Go back to English now, keeping it simple for a moment." : "",
    ingles_simple: "Use very simple English: short sentences, everyday words and a slower pace.",
    espanol_breve: "Give one short clarification in Spanish (the key word or phrase), then continue in English.",
    espanol_explicacion: "Explain in Spanish in at most two short sentences with one English example, then switch back to English and invite them to try.",
  };
  const textoPaso: Record<PasoSiguiente, string> = {
    seguir: "",
    simplificar: "Rephrase more simply: one idea at a time, common words, a little slower.",
    explicar: "Briefly explain the word, phrase or grammar point they need, with one short example, then hand the turn back so they can use it.",
    practicar: "Invite them to say the useful phrase again or use it in a new sentence of their own, then react to what they say.",
    ampliar: "They are coping well: ask an open question that needs a longer answer, or bring in one useful new expression.",
    nuevo_tema: configuracion.modo === "simulacion"
      ? "Move the role-play forward: add a new realistic request or a small complication in the same situation, staying in character."
      : configuracion.modo === "profesor"
        ? "Move on to the next small point of the learning goal, or give a short speaking task about it."
        : "Move to a fresh topic linked to their interests, or offer two topics to choose from.",
    animar: "Lower the pressure: reassure them, praise something concrete they said, and offer an easy way to answer, such as two options or a sentence starter.",
  };
  const lineas = [textoIdioma[idioma], textoPaso[paso]];

  if (tipoError && configuracion.correcciones !== "a_peticion" && !problema && animo !== "frustrado" && paso !== "explicar") {
    if (configuracion.correcciones === "durante" && (estado.errores[tipoError] ?? 0) >= 2 && turno - estado.ultimaCorreccion >= 2) {
      lineas.push(`They keep having trouble with ${DIFICULTAD[tipoError]}. After reacting to what they said, point out this one mistake briefly, give the correct version and ask for a quick retry.`);
      estado.ultimaCorreccion = turno;
    } else {
      lineas.push(`Their last turn had a mistake with ${DIFICULTAD[tipoError]}. Recast it: use the correct form naturally in your reply without pointing out the error.`);
    }
  }
  if (animo === "inseguro" && paso !== "animar") lineas.push("They sound unsure: be warm, encourage them and keep the pressure low.");
  if (animo === "frustrado" && paso !== "animar") lineas.push("They sound frustrated: acknowledge that it is hard and make the next step easier.");
  if (paso !== "explicar" && !espanol && contexto.palabrasTutor > 2.5 * Math.max(contexto.palabrasEstudiante, 4)) {
    lineas.push("You are talking much more than the learner: keep your reply to one or two short sentences and hand the turn back.");
  }
  if (estado.respuestasCortas >= 2) {
    lineas.push("Their answers are very short: ask an open question and give a sentence starter they can complete.");
  }
  let ayudaActiva: boolean | undefined;
  if (configuracion.modo !== "profesor") {
    if (!contexto.ayudaActiva && paso === "explicar" && (peticion === "explicacion" || peticion === "traducir" || estado.noEntiende >= 2)) {
      ayudaActiva = true;
    } else if (contexto.ayudaActiva && !problema && !espanol && (peticion === "retomar" || paso === "seguir" || paso === "ampliar" || paso === "nuevo_tema")) {
      ayudaActiva = false;
      if (paso !== "nuevo_tema") {
        lineas.push(configuracion.modo === "simulacion"
          ? "The explanation is finished: resume the role-play where you left it, in character."
          : "The explanation is finished: go back to the conversation where you left it.");
      }
    }
  }

  let intervencion = "";
  const umbralResuelto = peticion === "traducir" ? 0.6 : 0.35;
  const escalada = perdido && estado.noEntiende === 2;
  if (contexto.tutorRespondio && decision.tutorResolvio !== null && decision.tutorResolvio < umbralResuelto && (turno - estado.ultimaIntervencion >= 2 || escalada)) {
    if (perdido) {
      intervencion = permiteEspanol && (espanol || estado.noEntiende >= 2)
        ? "The learner did not understand your last message. Right now, explain it briefly in Spanish, in one or two short sentences, give one simple English example, then ask an easy question in English."
        : "The learner did not understand your last message. Right now, say it again in very simple English, slowly, with short sentences and common words, then ask an easy question.";
    } else if (peticion === "repetir" || peticion === "mas_despacio") {
      intervencion = "The learner asked you to repeat or slow down. Right now, say your last message again, more slowly and in simpler words.";
    } else if (peticion === "explicacion" || peticion === "traducir") {
      intervencion = permiteEspanol && (peticion === "traducir" || configuracion.idiomaAyuda === "espanol")
        ? "The learner asked for an explanation. Right now, explain it briefly in Spanish with one English example, then invite them to try in English."
        : "The learner asked for an explanation. Right now, explain it briefly in simple English with one example, then invite them to try.";
    } else if (peticion === "cambiar_tema") {
      intervencion = configuracion.modo === "simulacion"
        ? "The learner asked to change what you are doing. Right now, agree warmly and offer two short options: a new situation in this role-play or a different one."
        : "The learner asked to change the topic. Right now, agree warmly and move to the topic they asked for, or offer two topics if they did not name one.";
    }
    if (intervencion) estado.ultimaIntervencion = turno;
  }

  const nivel = etiquetaNivel(estado);
  if (nivel) lineas.push(`The learner's English sounds like about CEFR ${nivel}. Keep your language just a little above that level and never mention levels or scores.`);
  const cuerpo = lineas.filter(Boolean);
  const completa = cuerpo.length ? `${ENCABEZADO_GUIA}\n- ${cuerpo.join("\n- ")}` : previo.ultimaGuia && previo.ultimaGuia !== GUIA_NEUTRA ? GUIA_NEUTRA : "";
  if (completa) estado.ultimaGuia = completa;
  const enfoque = idioma === "espanol_explicacion" ? "Explicación en español"
    : idioma === "espanol_breve" ? "Aclaración en español"
      : paso === "explicar" ? "Explicación"
        : paso === "practicar" ? "Practica la frase"
          : paso === "nuevo_tema" ? "Nuevo tema"
            : paso === "ampliar" ? "Un paso más"
              : paso === "animar" ? "Sin presión"
                : idioma === "ingles_simple" || paso === "simplificar" ? "Inglés más sencillo"
                  : null;
  return { estado, guia: completa && completa !== previo.ultimaGuia ? completa : "", intervencion, ayudaActiva, enfoque };
}

export function notasSesion(estado: EstadoPedagogico): string {
  const partes: string[] = [];
  const lista = dificultades(estado);
  if (lista.length) partes.push(`difficulties noticed: ${lista.map(([tipo, veces]) => `${DIFICULTAD[tipo]} (${veces})`).join(", ")}`);
  const nivel = etiquetaNivel(estado);
  if (nivel) partes.push(`estimated speaking level about ${nivel}; use it as the progress level if one is requested, never as a score shown to the learner`);
  return partes.length ? `Teaching notes from the app, only to choose the focus; evidence must still be the learner's verbatim words: ${partes.join("; ")}.` : "";
}
