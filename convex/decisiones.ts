import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { buscarEscenario } from "./conversacionEscenarios";
import { nivelIngles } from "./schema";
import {
  ANIMOS, COMPRENSIONES, ERRORES, IDIOMAS_TUTOR, PASOS, PETICIONES,
  entradaTurno, entradaVoz, leerDecisionTurno, leerVoz, preguntasTurno, preguntaVoz, vozPorDefecto,
  type PreguntaDecision,
} from "../lib/practice-decisions";

const URL_DECISIONS = "https://api.openai.com/v1/decisions";
const LIMITE_MS = 5000;
const MAX_ENTRADAS = 12;
const MAX_TEXTO = 500;
const MAX_ERRORES = 5;

const configuracionPractica = v.object({
  modo: v.union(v.literal("profesor"), v.literal("libre"), v.literal("simulacion")),
  papel: v.union(v.literal("huesped"), v.literal("colaborador")),
  correcciones: v.union(v.literal("durante"), v.literal("al_final"), v.literal("a_peticion")),
  idiomaAyuda: v.union(v.literal("espanol"), v.literal("ingles")),
  escucha: v.union(v.literal("automatica"), v.literal("pulsar")),
  tema: v.string(),
});

function literales<T extends string>(valores: readonly T[]) {
  return v.union(...valores.map((valor) => v.literal(valor)));
}

function eleccion<T extends string>(valores: readonly T[]) {
  return v.object({ valor: literales(valores), probabilidad: v.number(), distribucion: v.record(v.string(), v.number()) });
}

const decisionTurno = v.object({
  comprension: eleccion(COMPRENSIONES),
  paso: eleccion(PASOS),
  idioma: eleccion(IDIOMAS_TUTOR),
  error: eleccion(ERRORES),
  animo: eleccion(ANIMOS),
  peticion: eleccion(PETICIONES),
  nivel: v.union(v.null(), v.object({ valor: v.number(), confianza: v.number() })),
  tutorResolvio: v.union(v.null(), v.number()),
});

function escenarioDe(escenarioId: string) {
  const escenario = buscarEscenario(escenarioId);
  return escenario ? { titulo: escenario.titulo, descripcion: escenario.descripcion } : undefined;
}

async function consultarDecisions(input: string, questions: PreguntaDecision[]): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.OPENAI_DECISIONES === "off") return null;
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), LIMITE_MS);
  try {
    const respuesta = await fetch(URL_DECISIONS, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODELO_DECISIONES ?? "gpt-6-luna", input, questions }),
      signal: control.signal,
    });
    if (!respuesta.ok) {
      console.warn(`[Decisions] ${respuesta.status}: ${(await respuesta.text()).slice(0, 300)}`);
      return null;
    }
    return await respuesta.json();
  } catch (error) {
    console.warn("[Decisions]", error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(limite);
  }
}

export const evaluarTurno = action({
  args: {
    escenarioId: v.string(),
    configuracion: configuracionPractica,
    historial: v.array(v.object({ rol: v.union(v.literal("estudiante"), v.literal("tutor")), texto: v.string() })),
    contexto: v.object({
      turnosTema: v.number(),
      noEntiende: v.number(),
      errores: v.array(v.string()),
      ayudaActiva: v.boolean(),
      papel: v.union(v.literal("huesped"), v.literal("colaborador")),
    }),
  },
  returns: v.union(v.null(), decisionTurno),
  handler: async (_ctx, args) => {
    if (args.configuracion.tema.length > 300) return null;
    const historial = args.historial
      .slice(-MAX_ENTRADAS)
      .map((entrada) => ({ rol: entrada.rol, texto: entrada.texto.trim().slice(-MAX_TEXTO) }))
      .filter((entrada) => entrada.texto);
    if (!historial.some((entrada) => entrada.rol === "estudiante")) return null;
    const contexto = { ...args.contexto, errores: args.contexto.errores.slice(0, MAX_ERRORES).map((error) => error.slice(0, 80)) };
    const datos = await consultarDecisions(
      entradaTurno(args.configuracion, historial, contexto, escenarioDe(args.escenarioId)),
      preguntasTurno(args.configuracion)
    );
    return datos ? leerDecisionTurno(datos) : null;
  },
});

export const elegirVoz = action({
  args: {
    escenarioId: v.string(),
    nivel: v.union(nivelIngles, v.null()),
    configuracion: configuracionPractica,
  },
  returns: v.object({
    proveedor: v.union(v.literal("mini"), v.literal("openai")),
    origen: v.union(v.literal("decisions"), v.literal("regla")),
  }),
  handler: async (ctx, args) => {
    if (args.configuracion.tema.length > 300) {
      throw new Error("El tema o situación debe tener como máximo 300 caracteres.");
    }
    const memoria: string = await ctx.runQuery(internal.conversacionMini.resumenProgresoInterno, {});
    const datos = await consultarDecisions(
      entradaVoz(args.configuracion, args.nivel, escenarioDe(args.escenarioId), memoria),
      [preguntaVoz()]
    );
    const voz = datos ? leerVoz(datos) : null;
    return voz ? { proveedor: voz, origen: "decisions" as const } : { proveedor: vozPorDefecto(args.configuracion), origen: "regla" as const };
  },
});
