import type { ConfiguracionPractica } from "./practice-config";
import {
  indexar, leerEleccion, numero, NIVELES_CEFR,
  type EntradaDecision, type NivelPerfil, type PreguntaDecision,
} from "./practice-decisions";

export const MAX_PALABRAS_DIA = 50;
export const MAX_ELEMENTOS_SESION = 25;
export const DIA_MS = 86400000;
export const TIPOS_ELEMENTO = ["palabra", "frase", "expresion", "phrasal_verb"] as const;
export const MOTIVOS_TEMA = ["reforzar", "retomar", "continuar"] as const;

export type TipoElemento = (typeof TIPOS_ELEMENTO)[number];
export type MotivoTema = (typeof MOTIVOS_TEMA)[number];
export type ElementoExtraido = {
  texto: string;
  tipo: TipoElemento;
  nivel: (typeof NIVELES_CEFR)[number];
  traduccion: string;
  significado: string;
  ejemplo: string;
  costo: boolean;
  evidencia: string;
};
export type Extraccion = { tema: string; elementos: ElementoExtraido[] };
export type RegistroSesion = {
  sesionId: string;
  fecha: string;
  escenarioId: string;
  configuracion: ConfiguracionPractica;
  historial: EntradaDecision[];
  dificultades: string[];
  nivel: NivelPerfil | null;
};
export type CandidatoPalabra = {
  texto: string;
  traduccion: string;
  temas: string[];
  vecesVista: number;
  vecesCosto: number;
  ultimoCosto?: string;
  costoEn?: number;
  vistaEn: number;
  dominio: number;
  proximoRepasoEn: number;
  repasos: number;
};
export type CandidatoTema = {
  nombre: string;
  sesiones: number;
  dificultad: number;
  ultimaDificultad: number;
  ultimaSesionEn: number;
  palabras: string[];
};

export function fechaLocal(fecha = new Date()): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

export function enFrase(nombre: string): string {
  return /^\p{Lu}\p{Lu}/u.test(nombre) ? nombre : nombre.charAt(0).toLowerCase() + nombre.slice(1);
}

export function esFecha(texto: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto);
}

function limpiar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

export function normalizarClave(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function claveTermino(texto: string, tipo: TipoElemento): string {
  const base = normalizarClave(texto);
  if (tipo === "phrasal_verb") return base.replace(/^to (?=\S)/, "");
  if (tipo !== "palabra") return base;
  return base.replace(/^(to|a|an|the) (?=\S+$)/, "");
}

export function solicitudRegistro(registro: RegistroSesion) {
  return {
    fecha: registro.fecha,
    sesionId: registro.sesionId,
    escenarioId: registro.escenarioId,
    modo: registro.configuracion.modo,
    tema: registro.configuracion.tema.slice(0, 300),
    nivel: registro.nivel,
    dificultades: registro.dificultades,
    historial: registro.historial,
  };
}

export function siguienteRepaso(anterior: { dominio: number; intervaloDias: number }, calificacion: number, ahora: number) {
  const intervaloDias = calificacion === 0 ? 0 : calificacion === 1 ? 1 : Math.max(3, Math.round(anterior.intervaloDias * (calificacion === 2 ? 2 : 3.5)));
  const dominio = Math.min(100, Math.max(0, anterior.dominio + [-20, 0, 15, 25][calificacion]));
  return { dominio, intervaloDias, proximoRepasoEn: ahora + (calificacion === 0 ? 60000 : intervaloDias * DIA_MS) };
}

export function textoConversacion(datos: {
  modo: ConfiguracionPractica["modo"];
  tema: string;
  escenario?: string;
  nivel: NivelPerfil | null;
  dificultades: string[];
  historial: EntradaDecision[];
}): string {
  const modo = { profesor: "teacher lesson", libre: "free conversation", simulacion: "role-play" }[datos.modo];
  return [
    "Spoken English practice between Bloom, an AI voice tutor, and a Spanish-speaking adult learner. Transcripts come from speech recognition and may contain recognition mistakes.",
    `Mode: ${modo}.${datos.escenario ? ` Situation: ${datos.escenario}.` : ""}${datos.tema.trim() ? ` Learner topic: ${JSON.stringify(limpiar(datos.tema))}.` : ""}`,
    `Learner level: ${datos.nivel && datos.nivel !== "sin_evaluar" ? datos.nivel : "unknown"}.`,
    datos.dificultades.length ? `Difficulties the app noticed: ${datos.dificultades.join(", ")}.` : "",
    "Conversation, oldest first:",
    ...datos.historial.map((entrada) => `${entrada.rol === "tutor" ? "Tutor" : "Learner"}: ${limpiar(entrada.texto)}`),
  ].filter(Boolean).join("\n");
}

export const INSTRUCCION_EXTRACCION = [
  "You build a personal vocabulary bank for a Spanish-speaking adult who learns English by talking with a voice tutor.",
  "Return the main topic of the conversation and the English vocabulary from it that is worth studying for this learner.",
  "tema: a short Spanish name of one to four words, for example \"Herramientas de mecánica\" or \"Planear un viaje\". When the conversation is about one of the earlier topics listed in the input, return that name exactly. Without a clear topic, use \"Conversación general\".",
  `elementos: at most ${MAX_ELEMENTOS_SESION} English words, phrases, expressions or phrasal verbs from this conversation: ones the learner used, tried to say, asked about, said in Spanish because they did not know the English, misused, or that the tutor taught or corrected. Skip very basic words the learner clearly knows (I, the, yes, hello, good) unless the learner struggled with them. Never invent elements that do not come from the conversation.`,
  "texto: the English dictionary form. Single words in base form (went -> go, tools -> tool), lowercase unless a proper noun, without a leading \"to\" or article. Phrases and expressions as they are naturally said.",
  "tipo: palabra, frase, expresion or phrasal_verb. nivel: the CEFR level of the element itself.",
  "traduccion: a short Spanish translation. significado: one short Spanish sentence explaining what it means and when it is used. ejemplo: one short natural English sentence related to the conversation topic.",
  "costo: true only when the conversation shows the learner struggled with it: asked what it means or how to say it, used Spanish instead, used it wrongly, did not understand it, or the tutor had to correct, explain or repeat it. Otherwise false.",
  "evidencia: when costo is true, a short Spanish note of what happened, at most 15 words, for example \"Usó 'llave' en español\" or \"Preguntó qué significa\". Otherwise an empty string.",
].join("\n");

export const ESQUEMA_EXTRACCION: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    tema: { type: "string" },
    elementos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          texto: { type: "string" },
          tipo: { type: "string", enum: [...TIPOS_ELEMENTO] },
          nivel: { type: "string", enum: [...NIVELES_CEFR] },
          traduccion: { type: "string" },
          significado: { type: "string" },
          ejemplo: { type: "string" },
          costo: { type: "boolean" },
          evidencia: { type: "string" },
        },
        required: ["texto", "tipo", "nivel", "traduccion", "significado", "ejemplo", "costo", "evidencia"],
      },
    },
  },
  required: ["tema", "elementos"],
};

export function entradaExtraccion(conversacion: string, temasPrevios: string[]): string {
  return [
    temasPrevios.length ? `Earlier topics: ${temasPrevios.map((tema) => JSON.stringify(tema)).join(", ")}.` : "Earlier topics: none.",
    conversacion,
  ].join("\n");
}

function texto(valor: unknown, maximo: number): string {
  return typeof valor === "string" ? limpiar(valor).slice(0, maximo) : "";
}

export function leerExtraccion(json: string): Extraccion | null {
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return null;
  }
  if (!datos || typeof datos !== "object") return null;
  const bruto = datos as { tema?: unknown; elementos?: unknown };
  const elementos: ElementoExtraido[] = [];
  for (const item of Array.isArray(bruto.elementos) ? bruto.elementos : []) {
    if (!item || typeof item !== "object") continue;
    const dato = item as Record<string, unknown>;
    const tipo = TIPOS_ELEMENTO.find((valor) => valor === dato.tipo) ?? "palabra";
    const elemento: ElementoExtraido = {
      texto: texto(dato.texto, 80),
      tipo,
      nivel: NIVELES_CEFR.find((valor) => valor === dato.nivel) ?? "A2",
      traduccion: texto(dato.traduccion, 80),
      significado: texto(dato.significado, 240),
      ejemplo: texto(dato.ejemplo, 200),
      costo: dato.costo === true,
      evidencia: dato.costo === true ? texto(dato.evidencia, 120) : "",
    };
    if (elemento.texto && elemento.traduccion && claveTermino(elemento.texto, tipo)) elementos.push(elemento);
    if (elementos.length === MAX_ELEMENTOS_SESION) break;
  }
  return { tema: texto(bruto.tema, 60) || "Conversación general", elementos };
}

const NIVELES_DIFICULTAD = [
  { label: "facil", description: "The learner followed and spoke about this topic easily; problems were rare and minor." },
  { label: "manejable", description: "Some effort: a few missing words or mistakes, but the learner mostly coped alone." },
  { label: "dificil", description: "Clear struggle: frequent missing words, Spanish, questions about meaning or repeated corrections." },
  { label: "muy_dificil", description: "The learner was often lost or blocked and needed a lot of help to keep talking about it." },
];

export function preguntaDificultad(): PreguntaDecision {
  return {
    type: "score",
    name: "dificultad_tema",
    instructions: "How much did the learner struggle with the English needed for this conversation's topic? Judge only the learner's own turns, never the tutor's.",
    levels: NIVELES_DIFICULTAD,
  };
}

export function leerDificultad(datos: unknown): number | null {
  const puntaje = numero(indexar(datos).get("dificultad_tema")?.score);
  return puntaje === null ? null : Math.min(1, Math.max(0, puntaje / (NIVELES_DIFICULTAD.length - 1)));
}

export function dificultadRegla(extraccion: Extraccion, dificultades: number): number {
  const costos = extraccion.elementos.filter((elemento) => elemento.costo).length;
  return Math.min(1, costos / Math.max(4, extraccion.elementos.length) + dificultades * 0.1);
}

const NECESIDAD = [
  { label: "no", description: "Not needed today: the learner knows it well, or reviewed it recently with good results and has not struggled with it since." },
  { label: "ligero", description: "A light refresh could help, but it is not a priority today." },
  { label: "practicar", description: "Needs practice today: the learner struggled with it, its mastery is low, or its written review is due." },
  { label: "prioridad", description: "Top priority today: repeated or recent struggles in voice practice, or low mastery with an overdue review." },
];
export const UMBRAL_NECESIDAD = 1.5;

function hace(momento: number, ahora: number): string {
  const dias = Math.floor((ahora - momento) / DIA_MS);
  return dias <= 0 ? "today" : dias === 1 ? "1 day ago" : `${dias} days ago`;
}

function lineaCandidato(candidato: CandidatoPalabra, posicion: number, ahora: number): string {
  const costo = candidato.vecesCosto
    ? `struggled ${candidato.vecesCosto} ${candidato.vecesCosto === 1 ? "time" : "times"}, last ${hace(candidato.costoEn ?? candidato.vistaEn, ahora)}${candidato.ultimoCosto ? ` (${candidato.ultimoCosto})` : ""}`
    : "no struggle noticed";
  const dias = Math.ceil((candidato.proximoRepasoEn - ahora) / DIA_MS);
  const repaso = candidato.repasos
    ? `written review mastery ${Math.round(candidato.dominio)}% after ${candidato.repasos} reviews, ${dias <= 0 ? "review due now" : `next review in ${dias} ${dias === 1 ? "day" : "days"}`}`
    : "never reviewed in writing";
  return `${posicion}. ${JSON.stringify(candidato.texto)} (${candidato.traduccion}); topics: ${candidato.temas.join(", ") || "none"}; seen in ${candidato.vecesVista} ${candidato.vecesVista === 1 ? "session" : "sessions"}, last ${hace(candidato.vistaEn, ahora)}; ${costo}; ${repaso}.`;
}

export function entradaPrioridad(candidatos: CandidatoPalabra[], nivel: NivelPerfil | null, ahora: number): string {
  return [
    `A Spanish-speaking adult learns English by talking with Bloom, an AI voice tutor. Bloom builds a written study list of up to ${MAX_PALABRAS_DIA} words and phrases for today, taken from the learner's own voice practice.`,
    `Learner level: ${nivel && nivel !== "sin_evaluar" ? nivel : "unknown"}.`,
    "Candidates from earlier voice sessions:",
    ...candidatos.map((candidato, indice) => lineaCandidato(candidato, indice + 1, ahora)),
  ].join("\n");
}

export function preguntasPrioridad(candidatos: CandidatoPalabra[]): PreguntaDecision[] {
  return candidatos.map((candidato, indice) => ({
    type: "score",
    name: `p${indice + 1}`,
    instructions: `How much does the learner need to study candidate ${indice + 1}, ${JSON.stringify(candidato.texto)}, today?`,
    levels: NECESIDAD,
  }));
}

export function leerPrioridades(datos: unknown, cantidad: number): (number | null)[] {
  const respuestas = indexar(datos);
  return Array.from({ length: cantidad }, (_, indice) => {
    const puntaje = numero(respuestas.get(`p${indice + 1}`)?.score);
    return puntaje === null ? null : Math.min(NECESIDAD.length - 1, Math.max(0, puntaje));
  });
}

export function prioridadBase(candidato: CandidatoPalabra, ahora: number): number {
  const reciente = candidato.costoEn !== undefined && ahora - candidato.costoEn <= 7 * DIA_MS;
  return candidato.vecesCosto * 2 + (reciente ? 2 : 0) + (candidato.proximoRepasoEn <= ahora ? 1.5 : 0)
    + (100 - candidato.dominio) / 50 - Math.max(0, candidato.vecesVista - candidato.vecesCosto) * 0.25;
}

export function necesidadRegla(candidato: CandidatoPalabra, ahora: number): number {
  if (candidato.dominio >= 85 && candidato.proximoRepasoEn > ahora) return 0;
  if (candidato.vecesCosto >= 2 || (candidato.costoEn !== undefined && ahora - candidato.costoEn <= 3 * DIA_MS)) return 3;
  if (candidato.vecesCosto >= 1 || (candidato.proximoRepasoEn <= ahora && candidato.dominio < 60)) return 2;
  return candidato.dominio < 50 ? 1 : 0;
}

function etiquetaDificultad(valor: number): string {
  return valor < 0.25 ? "easy" : valor < 0.5 ? "manageable" : valor < 0.75 ? "hard" : "very hard";
}

export function entradaTema(temas: CandidatoTema[], ahora: number): string {
  return [
    "A Spanish-speaking adult learns English by talking with Bloom, an AI voice tutor. Bloom wants to suggest one conversation topic for today's voice practice.",
    "Topics from earlier sessions:",
    ...temas.map((tema, indice) => `t${indice + 1}. ${JSON.stringify(tema.nombre)}: ${tema.sesiones} ${tema.sesiones === 1 ? "session" : "sessions"}, last ${hace(tema.ultimaSesionEn, ahora)}; difficulty last time: ${etiquetaDificultad(tema.ultimaDificultad)}; overall difficulty: ${etiquetaDificultad(tema.dificultad)}; ${tema.palabras.length ? `words still hard: ${tema.palabras.join(", ")}` : "no words still hard"}.`),
  ].join("\n");
}

export function preguntaTema(temas: CandidatoTema[]): PreguntaDecision {
  return {
    type: "choice",
    name: "tema",
    instructions: "Which topic should Bloom suggest for today's voice practice so it helps the learner most? Prefer a topic the learner found hard and has not reinforced since. A topic the learner already handles easily is a poor choice.",
    choices: [
      ...temas.map((tema, indice) => ({ value: `t${indice + 1}`, description: tema.nombre })),
      { value: "libre", description: "No topic needs reinforcement today; let the learner choose freely." },
    ],
  };
}

export function leerTema(datos: unknown, cantidad: number): number | "libre" | null {
  const valores = [...Array.from({ length: cantidad }, (_, indice) => `t${indice + 1}`), "libre"];
  const respuesta = indexar(datos).get("tema");
  if (!respuesta) return null;
  const eleccion = leerEleccion(respuesta, valores, "libre");
  return eleccion.valor === "libre" ? "libre" : valores.indexOf(eleccion.valor);
}

export function temaRegla(temas: CandidatoTema[], ahora: number): number | "libre" {
  let mejor: number | "libre" = "libre";
  let puntaje = 0;
  temas.forEach((tema, indice) => {
    const dias = (ahora - tema.ultimaSesionEn) / DIA_MS;
    if (tema.dificultad < 0.34 && dias < 3) return;
    const valor = tema.dificultad * 2 + Math.min(dias, 7) / 7 + tema.palabras.length * 0.1;
    if (valor > puntaje) {
      puntaje = valor;
      mejor = indice;
    }
  });
  return mejor;
}

export function elegirMotivo(tema: CandidatoTema, ahora: number): MotivoTema {
  if (tema.dificultad >= 0.5 || tema.ultimaDificultad >= 0.5) return "reforzar";
  return ahora - tema.ultimaSesionEn >= 4 * DIA_MS ? "retomar" : "continuar";
}

export function instruccionRefuerzo(palabras: string[]): string {
  if (!palabras.length) return "";
  return `Vocabulary the learner found hard in earlier voice sessions: ${palabras.map((palabra) => JSON.stringify(palabra)).join(", ")}. When it fits the conversation naturally, use some of these in your replies and give the learner chances to use them. Never quiz them as a list and never mention this note.`;
}
