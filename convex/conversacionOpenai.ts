import { action } from "./_generated/server";
import { v } from "convex/values";
import { buscarEscenario, construirInstruccion } from "./conversacionEscenarios";
import { nivelIngles } from "./schema";

const URL_TOKENS = "https://api.openai.com/v1/realtime/client_secrets";

export const crearTokenRealtime = action({
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Falta la variable OPENAI_API_KEY en el deployment de Convex."
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
    const modelo = process.env.OPENAI_MODELO_REALTIME ?? "gpt-realtime-2.1";
    const voz = process.env.OPENAI_VOZ_REALTIME ?? "marin";
    const respuesta = await fetch(URL_TOKENS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: modelo,
          output_modalities: ["audio"],
          audio: { output: { voice: voz } },
        },
      }),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      throw new Error(
        `OpenAI rechazó la sesión (${respuesta.status}): ${detalle.slice(0, 300)}`
      );
    }
    const datos = await responseJson(respuesta);
    const token = leerToken(datos);
    if (!token) {
      throw new Error("OpenAI no devolvió un token efímero.");
    }
    return {
      token,
      modelo,
      voz,
      instruccion: construirInstruccion(escenario, args.nivel, args.configuracion),
    };
  },
});

async function responseJson(respuesta: Response): Promise<Record<string, unknown>> {
  const datos = (await respuesta.json()) as unknown;
  return datos && typeof datos === "object" ? (datos as Record<string, unknown>) : {};
}

function leerToken(datos: Record<string, unknown>): string | undefined {
  if (typeof datos.value === "string") return datos.value;
  const secreto = datos.client_secret;
  if (secreto && typeof secreto === "object" && typeof (secreto as { value?: unknown }).value === "string") {
    return (secreto as { value: string }).value;
  }
  return undefined;
}
