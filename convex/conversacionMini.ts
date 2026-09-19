import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { buscarEscenario, construirInstruccion } from "./conversacionEscenarios";
import { nivelIngles } from "./schema";
import type { ConfiguracionPractica } from "../lib/practice-config";
import { DESCRIPCION_GUARDAR_PROGRESO, ESQUEMA_GUARDAR_PROGRESO } from "../lib/practice-tools";

// gpt-realtime-2.1-mini connects straight to the Realtime API over WebRTC.
// Function calling is handled here in Convex — no extra LLM in the loop.
const URL_SESIONES_REALTIME = "https://api.openai.com/v1/realtime/sessions";
const MAX_PROGRESO_GUARDADO = 8;
const LIMITE_ELEMENTOS_PROGRESO = 10;

const configuracionPractica = v.object({
  modo: v.union(v.literal("profesor"), v.literal("libre"), v.literal("simulacion")),
  papel: v.union(v.literal("huesped"), v.literal("colaborador")),
  correcciones: v.union(v.literal("durante"), v.literal("al_final"), v.literal("a_peticion")),
  idiomaAyuda: v.union(v.literal("espanol"), v.literal("ingles")),
  escucha: v.union(v.literal("automatica"), v.literal("pulsar")),
  tema: v.string(),
});

function exigirApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable OPENAI_API_KEY en el deployment de Convex.");
  }
  return apiKey;
}

function validarSolicitud(escenarioId: string, configuracion: ConfiguracionPractica | undefined) {
  const escenario = buscarEscenario(escenarioId);
  if ((configuracion?.tema.length ?? 0) > 300) {
    throw new Error("El tema o situación debe tener como máximo 300 caracteres.");
  }
  const esSimulacion = !configuracion || configuracion.modo === "simulacion";
  if (esSimulacion && !escenario && escenarioId !== "personalizado") {
    throw new Error("El escenario de conversación no existe.");
  }
  if (esSimulacion && escenarioId === "personalizado" && !configuracion?.tema.trim()) {
    throw new Error("Describe la situación que quieres practicar.");
  }
  return escenario;
}
export const prepararSesionMini = action({
  args: {
    escenarioId: v.string(),
    nivel: v.union(nivelIngles, v.null()),
    configuracion: v.optional(configuracionPractica),
  },
  returns: v.object({
    token: v.string(), modelo: v.string(), voz: v.string(), instruccion: v.string(), progresoPrevio: v.string(),
  }),
  handler: async (ctx, args) => {
    const apiKey = exigirApiKey();
    const escenario = validarSolicitud(args.escenarioId, args.configuracion);
    const modelo = process.env.OPENAI_MODELO_MINI ?? "gpt-realtime-2.1-mini";
    const voz = process.env.OPENAI_VOZ_MINI ?? "marin";
    let instruccion = construirInstruccion(escenario, args.nivel, args.configuracion);
    // Feed only the compact progress summary, never a past transcript.
    const progresoPrevio: string = await ctx.runQuery(internal.conversacionMini.resumenProgresoInterno, {});
    if (progresoPrevio) {
      instruccion += `\nLearner memory from previous sessions: ${progresoPrevio}. Naturally reuse the phrases to practice during the conversation; do not quiz the learner about this list.`;
    }
    const respuesta = await fetch(URL_SESIONES_REALTIME, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        modalities: ["audio", "text"],
        instructions: instruccion,
        voice: voz,
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 250,
          silence_duration_ms: 800,
          create_response: true,
          interrupt_response: true,
        },
        max_response_output_tokens: 256,
        tools: [{ type: "function", name: "guardar_progreso", description: DESCRIPCION_GUARDAR_PROGRESO, parameters: ESQUEMA_GUARDAR_PROGRESO }],
        tool_choice: "auto",
      }),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      throw new Error(`OpenAI rechazó la sesión Realtime Mini (${respuesta.status}): ${detalle.slice(0, 300)}`);
    }
    const datos = (await respuesta.json()) as { client_secret?: { value?: unknown } };
    const token = typeof datos.client_secret?.value === "string" ? datos.client_secret.value : "";
    if (!token) {
      throw new Error("OpenAI no devolvió el token efímero de la sesión Realtime Mini.");
    }
    return { token, modelo, voz, instruccion, progresoPrevio };
  },
});// Realtime Mini native function calling -> Convex. No other LLM involved.
export const ejecutarHerramientaMini = action({
  args: {
    nombre: v.string(),
    argumentos: v.string(),
    nivel: v.union(nivelIngles, v.null()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    if (args.nombre !== "guardar_progreso") {
      return { error: "Unsupported request" };
    }
    let datos: unknown;
    try {
      datos = JSON.parse(args.argumentos);
    } catch {
      return { error: "Invalid arguments JSON" };
    }
    const entrada = (datos ?? {}) as Record<string, unknown>;
    const niveles = ["sin_evaluar", "A1", "A2", "B1", "B2", "C1", "C2"];
    const limpiar = (valor: unknown): string[] =>
      Array.isArray(valor)
        ? valor.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, LIMITE_ELEMENTOS_PROGRESO)
        : [];
    await ctx.runMutation(internal.conversacionMini.guardarProgresoInterno, {
      nivel: niveles.includes(String(entrada.level)) ? String(entrada.level) : (args.nivel ?? "sin_evaluar"),
      aprendidas: limpiar(entrada.learned),
      porPracticar: limpiar(entrada.needsPractice),
    });
    return { ok: true };
  },
});

export const guardarProgresoInterno = internalMutation({
  args: { nivel: v.string(), aprendidas: v.array(v.string()), porPracticar: v.array(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("progresoConversaciones", {
      nivel: args.nivel as "A1",
      aprendidas: args.aprendidas,
      porPracticar: args.porPracticar,
      creadoEn: Date.now(),
    });
  },
});

export const resumenProgresoInterno = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const recientes = await ctx.db.query("progresoConversaciones").order("desc").take(MAX_PROGRESO_GUARDADO);
    if (!recientes.length) return "";
    const unicos = (listas: string[][]) => [...new Set(listas.flat())].slice(0, LIMITE_ELEMENTOS_PROGRESO);
    const resumen = {
      level: recientes[0].nivel,
      learned: unicos(recientes.map((r) => r.aprendidas)),
      needsPractice: unicos(recientes.map((r) => r.porPracticar)),
    };
    return JSON.stringify(resumen);
  },
});