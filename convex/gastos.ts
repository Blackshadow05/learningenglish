import { internalMutation, mutation, query, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { conceptoGasto, proveedorVoz, usoApi } from "./schema";
import { costoUso, fechaUtc, hayUso, sumarUso, type ConceptoGasto, type Uso } from "../lib/api-costs";
import { esFecha } from "../lib/learning-memory";

const MAX_DIAS = 31;
const MAX_CONSUMOS_SESION = 12;

type Registro = { fecha: string; sesionId?: string; concepto: ConceptoGasto; modelo: string; uso: Uso; llamadas: number };

const partida = v.object({ concepto: conceptoGasto, modelo: v.string(), costo: v.number(), llamadas: v.number() });

function modeloPorDefecto(concepto: ConceptoGasto): string {
  if (concepto === "transcripcion") return process.env.OPENAI_TRANSCRIPCION_MINI ?? "gpt-4o-mini-transcribe";
  if (concepto === "apoyo") return process.env.OPENAI_MODELO_BACKEND ?? "gpt-6-luna";
  return "desconocido";
}

async function acumular(ctx: MutationCtx, registro: Registro) {
  if (!hayUso(registro.uso) && !registro.llamadas) return;
  const ahora = Date.now();
  const modelo = registro.modelo || modeloPorDefecto(registro.concepto);
  const clave = `${registro.sesionId ?? registro.fecha}|${registro.concepto}|${modelo}`;
  const existente = await ctx.db.query("consumos").withIndex("por_clave", (q) => q.eq("clave", clave)).first();
  if (existente) {
    const uso = sumarUso(existente.uso, registro.uso);
    await ctx.db.patch("consumos", existente._id, {
      uso,
      llamadas: existente.llamadas + registro.llamadas,
      costo: costoUso(modelo, uso),
      actualizadoEn: ahora,
    });
    return;
  }
  await ctx.db.insert("consumos", {
    clave,
    fecha: registro.fecha,
    sesionId: registro.sesionId,
    concepto: registro.concepto,
    modelo,
    uso: registro.uso,
    llamadas: registro.llamadas,
    costo: costoUso(modelo, registro.uso),
    creadoEn: ahora,
    actualizadoEn: ahora,
  });
}

export async function registrarUso(
  ctx: ActionCtx,
  registro: { fecha?: string; sesionId?: string; concepto: ConceptoGasto; modelo: string; uso: Uso; llamadas: number }
): Promise<void> {
  if (!hayUso(registro.uso)) return;
  const fecha = registro.fecha && esFecha(registro.fecha) ? registro.fecha : fechaUtc();
  try {
    await ctx.runMutation(internal.gastos.registrarInterno, { ...registro, fecha, sesionId: registro.sesionId?.slice(0, 64) });
  } catch (error) {
    console.warn("[Gastos]", error instanceof Error ? error.message : error);
  }
}

export const registrarInterno = internalMutation({
  args: {
    fecha: v.string(),
    sesionId: v.optional(v.string()),
    concepto: conceptoGasto,
    modelo: v.string(),
    uso: usoApi,
    llamadas: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await acumular(ctx, args);
    return null;
  },
});

export const registrarSesionVoz = mutation({
  args: {
    sesionId: v.string(),
    fecha: v.string(),
    proveedor: proveedorVoz,
    modelo: v.string(),
    modo: v.string(),
    tema: v.string(),
    inicio: v.number(),
    duracionSegundos: v.number(),
    turnos: v.number(),
    consumos: v.array(v.object({ concepto: conceptoGasto, modelo: v.string(), uso: usoApi, llamadas: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!esFecha(args.fecha) || !args.sesionId || args.sesionId.length > 64 || args.consumos.length > MAX_CONSUMOS_SESION) {
      throw new Error("Los datos de gasto de la sesión no son válidos.");
    }
    const ahora = Date.now();
    const datos = {
      fecha: args.fecha,
      proveedor: args.proveedor,
      modelo: args.modelo.slice(0, 80),
      modo: args.modo.slice(0, 20),
      tema: args.tema.slice(0, 300),
      inicio: args.inicio,
      duracionSegundos: Math.max(0, Math.round(args.duracionSegundos)),
      turnos: Math.max(0, Math.round(args.turnos)),
    };
    const existente = await ctx.db.query("sesionesVoz").withIndex("por_sesion", (q) => q.eq("sesionId", args.sesionId)).first();
    if (existente) await ctx.db.patch("sesionesVoz", existente._id, datos);
    else await ctx.db.insert("sesionesVoz", { sesionId: args.sesionId, ...datos, creadoEn: ahora });
    for (const consumo of args.consumos) {
      await acumular(ctx, { ...consumo, modelo: consumo.modelo.slice(0, 80), fecha: args.fecha, sesionId: args.sesionId });
    }
    return null;
  },
});

function agrupar(consumos: Doc<"consumos">[]) {
  const partidas = new Map<string, { concepto: ConceptoGasto; modelo: string; costo: number; llamadas: number }>();
  for (const consumo of consumos) {
    const clave = `${consumo.concepto}|${consumo.modelo}`;
    const actual = partidas.get(clave) ?? { concepto: consumo.concepto, modelo: consumo.modelo, costo: 0, llamadas: 0 };
    actual.costo += consumo.costo;
    actual.llamadas += consumo.llamadas;
    partidas.set(clave, actual);
  }
  return [...partidas.values()].sort((a, b) => b.costo - a.costo);
}

export const resumenDias = query({
  args: { fechas: v.array(v.string()) },
  returns: v.array(v.object({
    fecha: v.string(),
    total: v.number(),
    sesiones: v.number(),
    partidas: v.array(partida),
  })),
  handler: async (ctx, args) => {
    const fechas = args.fechas.filter(esFecha).slice(0, MAX_DIAS);
    return await Promise.all(fechas.map(async (fecha) => {
      const consumos = await ctx.db.query("consumos").withIndex("por_fecha", (q) => q.eq("fecha", fecha)).collect();
      const sesiones = await ctx.db.query("sesionesVoz").withIndex("por_fecha", (q) => q.eq("fecha", fecha)).collect();
      const ids = new Set([...sesiones.map((sesion) => sesion.sesionId), ...consumos.flatMap((consumo) => (consumo.sesionId ? [consumo.sesionId] : []))]);
      return {
        fecha,
        total: consumos.reduce((suma, consumo) => suma + consumo.costo, 0),
        sesiones: ids.size,
        partidas: agrupar(consumos),
      };
    }));
  },
});

export const sesionesDelDia = query({
  args: { fecha: v.string() },
  returns: v.object({
    sesiones: v.array(v.object({
      sesionId: v.string(),
      proveedor: v.union(proveedorVoz, v.null()),
      modo: v.string(),
      tema: v.string(),
      inicio: v.union(v.number(), v.null()),
      duracionSegundos: v.number(),
      turnos: v.number(),
      total: v.number(),
      partidas: v.array(partida),
    })),
    otros: v.array(partida),
  }),
  handler: async (ctx, args) => {
    if (!esFecha(args.fecha)) return { sesiones: [], otros: [] };
    const consumos = await ctx.db.query("consumos").withIndex("por_fecha", (q) => q.eq("fecha", args.fecha)).collect();
    const metadatos = await ctx.db.query("sesionesVoz").withIndex("por_fecha", (q) => q.eq("fecha", args.fecha)).collect();
    const porSesion = new Map<string, Doc<"consumos">[]>();
    for (const consumo of consumos) {
      if (!consumo.sesionId) continue;
      porSesion.set(consumo.sesionId, [...(porSesion.get(consumo.sesionId) ?? []), consumo]);
    }
    for (const sesion of metadatos) if (!porSesion.has(sesion.sesionId)) porSesion.set(sesion.sesionId, []);
    const sesiones = [...porSesion.entries()].map(([sesionId, lista]) => {
      const meta = metadatos.find((sesion) => sesion.sesionId === sesionId);
      return {
        sesionId,
        proveedor: meta?.proveedor ?? null,
        modo: meta?.modo ?? "",
        tema: meta?.tema ?? "",
        inicio: meta?.inicio ?? (lista.length ? Math.min(...lista.map((consumo) => consumo.creadoEn)) : null),
        duracionSegundos: meta?.duracionSegundos ?? 0,
        turnos: meta?.turnos ?? 0,
        total: lista.reduce((suma, consumo) => suma + consumo.costo, 0),
        partidas: agrupar(lista),
      };
    }).sort((a, b) => (b.inicio ?? 0) - (a.inicio ?? 0));
    return { sesiones, otros: agrupar(consumos.filter((consumo) => !consumo.sesionId)) };
  },
});
