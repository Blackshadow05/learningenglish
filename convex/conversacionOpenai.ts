import { action } from "./_generated/server";
import { v } from "convex/values";
import { buscarEscenario, construirInstruccion } from "./conversacionEscenarios";
import { nivelIngles } from "./schema";
import type { ConfiguracionPractica } from "../lib/practice-config";
import { DESCRIPCION_ENTREGAR_RESUMEN, ESQUEMA_ENTREGAR_RESUMEN, INSTRUCCION_BACKEND_RESUMEN, INSTRUCCION_HERRAMIENTAS_OPENAI } from "../lib/practice-tools";

const URL_SESIONES = "https://api.openai.com/v1/live/sessions";

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

function construirSesion(escenarioId: string, nivel: string | null, configuracion: ConfiguracionPractica | undefined) {
  const escenario = validarSolicitud(escenarioId, configuracion);
  const modelo = process.env.OPENAI_MODELO_LIVE ?? "gpt-live-1";
  const voz = process.env.OPENAI_VOZ_LIVE ?? "marin";
  const modeloBackend = process.env.OPENAI_MODELO_BACKEND ?? "gpt-5.6-terra";
  const instruccion = `${construirInstruccion(escenario, nivel, configuracion)}\n${INSTRUCCION_HERRAMIENTAS_OPENAI}`;
  return {
    modelo,
    voz,
    instruccion,
    sesionJson: JSON.stringify({
      model: modelo,
      instructions: instruccion,
      audio: { output: { voice: voz } },
      delegation: {
        type: "responses",
        responses: {
          model: modeloBackend,
          instructions: INSTRUCCION_BACKEND_RESUMEN,
          tools: [
            {
              type: "function",
              name: "entregar_resumen",
              description: DESCRIPCION_ENTREGAR_RESUMEN,
              parameters: ESQUEMA_ENTREGAR_RESUMEN,
            },
          ],
          tool_choice: "auto",
        },
      },
    }),
  };
}

function leerSesion(sesionJson: string): Record<string, unknown> {
  let sesion: unknown;
  try {
    sesion = JSON.parse(sesionJson);
  } catch {
    throw new Error("La configuración de la sesión GPT-Live no es válida.");
  }
  if (!sesion || typeof sesion !== "object") {
    throw new Error("La configuración de la sesión GPT-Live no es válida.");
  }
  const modeloEsperado = process.env.OPENAI_MODELO_LIVE ?? "gpt-live-1";
  if ((sesion as { model?: unknown }).model !== modeloEsperado) {
    throw new Error("La configuración no corresponde al modelo GPT-Live del deployment.");
  }
  return sesion as Record<string, unknown>;
}

export const prepararSesionLive = action({
  args: {
    escenarioId: v.string(),
    nivel: v.union(nivelIngles, v.null()),
    configuracion: v.optional(configuracionPractica),
  },
  returns: v.object({ token: v.string(), modelo: v.string(), voz: v.string(), instruccion: v.string(), sesionJson: v.string() }),
  handler: async (_ctx, args) => {
    exigirApiKey();
    const { modelo, voz, instruccion, sesionJson } = construirSesion(args.escenarioId, args.nivel, args.configuracion);
    return { token: "", modelo, voz, instruccion, sesionJson };
  },
});

export const crearSesionWebrtc = action({
  args: {
    sdp: v.string(),
    sesionJson: v.string(),
  },
  returns: v.object({ sesionId: v.string(), sdp: v.string() }),
  handler: async (_ctx, args) => {
    const apiKey = exigirApiKey();
    if (!args.sdp.trim()) {
      throw new Error("Falta la oferta SDP del navegador.");
    }
    const sesion = leerSesion(args.sesionJson);
    const respuesta = await fetch(URL_SESIONES, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session: sesion, transport: { type: "webrtc", sdp: args.sdp } }),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      throw new Error(
        `OpenAI rechazó la sesión GPT-Live (${respuesta.status}): ${detalle.slice(0, 300)}`
      );
    }
    const datos = (await respuesta.json()) as {
      session?: { id?: unknown };
      transport?: { sdp?: unknown };
    };
    const sesionId = typeof datos.session?.id === "string" ? datos.session.id : "";
    const sdp = typeof datos.transport?.sdp === "string" ? datos.transport.sdp : "";
    if (!sesionId || !sdp) {
      throw new Error("OpenAI no devolvió la sesión WebRTC esperada.");
    }
    return { sesionId, sdp };
  },
});
