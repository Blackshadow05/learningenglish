"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { buscarEscenario, construirInstruccion } from "./conversacionEscenarios";
import { nivelIngles } from "./schema";

const MINUTOS_TOKEN = 30;
const MINUTOS_SESION_NUEVA = 2;

export const crearTokenLive = action({
  args: {
    escenarioId: v.string(),
    nivel: v.union(nivelIngles, v.null()),
    configuracion: v.optional(v.object({
      modo: v.union(v.literal("profesor"), v.literal("libre"), v.literal("simulacion")),
      papel: v.union(v.literal("huesped"), v.literal("colaborador")),
      correcciones: v.union(v.literal("durante"), v.literal("al_final"), v.literal("a_peticion")),
      idiomaAyuda: v.union(v.literal("espanol"), v.literal("ingles")),
      escucha: v.union(v.literal("automatica"), v.literal("pulsar")),
      tema: v.string(),
    })),
  },
  returns: v.object({ token: v.string(), modelo: v.string(), voz: v.string(), instruccion: v.string() }),
  handler: async (_ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Falta la variable GEMINI_API_KEY en el deployment de Convex."
      );
    }
    const escenario = buscarEscenario(args.escenarioId);
    if ((args.configuracion?.tema.length ?? 0) > 300) {
      throw new Error("El tema o situación debe tener como máximo 300 caracteres.");
    }
    const esSimulacion = !args.configuracion || args.configuracion.modo === "simulacion";
    if (esSimulacion && !escenario && args.escenarioId !== "personalizado") {
      throw new Error("El escenario de conversación no existe.");
    }
    if (esSimulacion && args.escenarioId === "personalizado" && !args.configuracion?.tema.trim()) {
      throw new Error("Describe la situación que quieres practicar.");
    }
    const modelo = process.env.GEMINI_MODELO_LIVE ?? "gemini-3.8-live";
    const voz = process.env.GEMINI_VOZ_LIVE ?? "Zephyr";
    const cliente = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
    const ahora = Date.now();
    const token = await cliente.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(
          ahora + MINUTOS_TOKEN * 60 * 1000
        ).toISOString(),
        newSessionExpireTime: new Date(
          ahora + MINUTOS_SESION_NUEVA * 60 * 1000
        ).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    if (!token.name) {
      throw new Error("No se pudo crear el token efímero de Gemini.");
    }
    return {
      token: token.name,
      modelo,
      voz,
      instruccion: construirInstruccion(escenario, args.nivel, args.configuracion),
    };
  },
});
