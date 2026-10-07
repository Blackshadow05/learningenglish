import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { motivoTema, nivelIngles, tipoContenido } from "./schema";
import { consultarDecisions, registrarUsoDecisions } from "./decisiones";
import { registrarUso } from "./gastos";
import { usoRespuestas, type Uso } from "../lib/api-costs";
import { buscarEscenario } from "./conversacionEscenarios";
import {
  claveTermino, dificultadRegla, elegirMotivo, entradaExtraccion, entradaPrioridad, entradaTema, esFecha,
  ESQUEMA_EXTRACCION, INSTRUCCION_EXTRACCION, instruccionRefuerzo, leerDificultad, leerExtraccion, leerPrioridades,
  leerTema, MAX_PALABRAS_DIA, necesidadRegla, normalizarClave, preguntaDificultad, preguntasPrioridad, preguntaTema,
  prioridadBase, siguienteRepaso, temaRegla, textoConversacion, UMBRAL_NECESIDAD,
  type CandidatoPalabra, type CandidatoTema, type Extraccion, type MotivoTema,
} from "../lib/learning-memory";

const URL_RESPUESTAS = "https://api.openai.com/v1/responses";
const LIMITE_EXTRACCION_MS = 30000;
const LIMITE_PLAN_MS = 15000;
const MAX_ENTRADAS = 120;
const MAX_TEXTO = 600;
const MIN_PALABRAS_ALUMNO = 6;
const MAX_TEMAS_PREVIOS = 30;
const MAX_TEMAS_PALABRA = 6;
const MAX_CANDIDATOS = 64;
const TAMANO_LOTE = 8;
const MAX_TEMAS_SUGERENCIA = 8;
const MAX_PALABRAS_TEMA = 6;
const MAX_PALABRAS_REFUERZO = 8;
const MAX_OTROS_TEMAS = 4;
const DOMINIO_DIFICIL = 80;
const DIFICULTAD_REFUERZO = 0.25;
const RESERVA_MS = 2 * 60 * 1000;

const elementoExtraido = v.object({
  texto: v.string(),
  tipo: tipoContenido,
  nivel: nivelIngles,
  traduccion: v.string(),
  significado: v.string(),
  ejemplo: v.string(),
  costo: v.boolean(),
  evidencia: v.string(),
});

const palabraPlan = v.object({
  palabraId: v.id("vocabularioPersonal"),
  prioridad: v.number(),
});

const temaPlan = v.object({ temaId: v.id("temasConversacion"), motivo: motivoTema });

type CandidatoGuardado = CandidatoPalabra & { id: Id<"vocabularioPersonal"> };
type TemaGuardado = CandidatoTema & { id: Id<"temasConversacion">; ultimaFecha: string };
type Candidatos = { palabras: CandidatoGuardado[]; temas: TemaGuardado[] };

function contarPalabras(texto: string) {
  return texto.split(/\s+/).filter(Boolean).length;
}

function textoRespuesta(datos: unknown): string {
  if (!datos || typeof datos !== "object") return "";
  const directo = (datos as { output_text?: unknown }).output_text;
  if (typeof directo === "string") return directo;
  const salida = (datos as { output?: unknown }).output;
  if (!Array.isArray(salida)) return "";
  return salida
    .flatMap((item) => (item && typeof item === "object" && Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : []))
    .map((parte) => (parte && typeof parte === "object" && (parte as { type?: unknown }).type === "output_text" ? (parte as { text?: unknown }).text : ""))
    .filter((texto): texto is string => typeof texto === "string")
    .join("");
}

async function extraerVocabulario(entrada: string): Promise<{ extraccion: Extraccion | null; modelo: string; uso: Uso | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelo = process.env.OPENAI_MODELO_VOCABULARIO ?? process.env.OPENAI_MODELO_BACKEND ?? "gpt-6-luna";
  if (!apiKey) return { extraccion: null, modelo, uso: null };
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), LIMITE_EXTRACCION_MS);
  try {
    const respuesta = await fetch(URL_RESPUESTAS, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        instructions: INSTRUCCION_EXTRACCION,
        input: entrada,
        reasoning: { effort: process.env.OPENAI_ESFUERZO_VOCABULARIO ?? "low" },
        text: { format: { type: "json_schema", name: "vocabulario_sesion", strict: true, schema: ESQUEMA_EXTRACCION } },
      }),
      signal: control.signal,
    });
    if (!respuesta.ok) {
      console.warn(`[Vocabulario] ${respuesta.status}: ${(await respuesta.text()).slice(0, 300)}`);
      return { extraccion: null, modelo, uso: null };
    }
    const datos = (await respuesta.json()) as { model?: unknown; usage?: unknown };
    return {
      extraccion: leerExtraccion(textoRespuesta(datos)),
      modelo: typeof datos.model === "string" ? datos.model : modelo,
      uso: usoRespuestas(datos.usage),
    };
  } catch (error) {
    console.warn("[Vocabulario]", error instanceof Error ? error.message : error);
    return { extraccion: null, modelo, uso: null };
  } finally {
    clearTimeout(limite);
  }
}

async function palabrasDificiles(ctx: { db: QueryCtx["db"] }, temaId: Id<"temasConversacion"> | null, cantidad: number): Promise<Doc<"vocabularioPersonal">[]> {
  const recientes = await ctx.db
    .query("vocabularioPersonal")
    .withIndex("por_costo", (q) => q.gt("costoEn", 0))
    .order("desc")
    .take(200);
  return recientes.filter((doc) => doc.dominio < DOMINIO_DIFICIL && (!temaId || doc.temas.includes(temaId))).slice(0, cantidad);
}

export const procesarSesion = action({
  args: {
    fecha: v.string(),
    sesionId: v.optional(v.string()),
    escenarioId: v.string(),
    modo: v.union(v.literal("profesor"), v.literal("libre"), v.literal("simulacion")),
    tema: v.string(),
    nivel: v.union(nivelIngles, v.null()),
    dificultades: v.array(v.string()),
    historial: v.array(v.object({ rol: v.union(v.literal("estudiante"), v.literal("tutor")), texto: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!esFecha(args.fecha) || args.tema.length > 300) return null;
    const historial = args.historial
      .slice(-MAX_ENTRADAS)
      .map((entrada) => ({ rol: entrada.rol, texto: entrada.texto.trim().slice(0, MAX_TEXTO) }))
      .filter((entrada) => entrada.texto);
    const palabrasAlumno = historial.filter((entrada) => entrada.rol === "estudiante").reduce((suma, entrada) => suma + contarPalabras(entrada.texto), 0);
    if (palabrasAlumno < MIN_PALABRAS_ALUMNO) return null;
    const dificultades = args.dificultades.slice(0, 5).map((dificultad) => dificultad.slice(0, 80));
    const conversacion = textoConversacion({
      modo: args.modo,
      tema: args.tema,
      escenario: args.modo === "simulacion" ? buscarEscenario(args.escenarioId)?.titulo : undefined,
      nivel: args.nivel,
      dificultades,
      historial,
    });
    const temasPrevios: string[] = await ctx.runQuery(internal.aprendizaje.nombresTemasInterno, {});
    const [resultado, decision] = await Promise.all([
      extraerVocabulario(entradaExtraccion(conversacion, temasPrevios)),
      consultarDecisions(conversacion, [preguntaDificultad()], LIMITE_PLAN_MS),
    ]);
    const registro = { fecha: args.fecha, sesionId: args.sesionId, concepto: "vocabulario" as const };
    if (resultado.uso) await registrarUso(ctx, { ...registro, modelo: resultado.modelo, uso: resultado.uso, llamadas: 1 });
    await registrarUsoDecisions(ctx, [decision], registro);
    const extraccion = resultado.extraccion;
    if (!extraccion) return null;
    await ctx.runMutation(internal.aprendizaje.registrarSesionInterno, {
      fecha: args.fecha,
      tema: extraccion.tema,
      dificultad: (decision ? leerDificultad(decision) : null) ?? dificultadRegla(extraccion, dificultades.length),
      elementos: extraccion.elementos,
    });
    return null;
  },
});

export const nombresTemasInterno = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const temas = await ctx.db.query("temasConversacion").withIndex("por_ultima_sesion").order("desc").take(MAX_TEMAS_PREVIOS);
    return temas.map((tema) => tema.nombre);
  },
});

export const registrarSesionInterno = internalMutation({
  args: { fecha: v.string(), tema: v.string(), dificultad: v.number(), elementos: v.array(elementoExtraido) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ahora = Date.now();
    const dificultad = Math.min(1, Math.max(0, args.dificultad));
    const claveTema = normalizarClave(args.tema) || "conversacion general";
    const temaExistente = await ctx.db.query("temasConversacion").withIndex("por_clave", (q) => q.eq("clave", claveTema)).first();
    let temaId: Id<"temasConversacion">;
    if (temaExistente) {
      temaId = temaExistente._id;
      await ctx.db.patch("temasConversacion", temaId, {
        sesiones: temaExistente.sesiones + 1,
        dificultad: temaExistente.dificultad * 0.6 + dificultad * 0.4,
        ultimaDificultad: dificultad,
        ultimaSesionEn: ahora,
        ultimaFecha: args.fecha,
      });
    } else {
      temaId = await ctx.db.insert("temasConversacion", {
        clave: claveTema, nombre: args.tema, sesiones: 1, dificultad, ultimaDificultad: dificultad,
        ultimaSesionEn: ahora, ultimaFecha: args.fecha, creadoEn: ahora,
      });
    }

    const costosas: Id<"vocabularioPersonal">[] = [];
    const vistas = new Set<string>();
    for (const elemento of args.elementos) {
      const clave = claveTermino(elemento.texto, elemento.tipo);
      if (!clave || vistas.has(clave)) continue;
      vistas.add(clave);
      const existente = await ctx.db.query("vocabularioPersonal").withIndex("por_clave", (q) => q.eq("clave", clave)).first();
      let id: Id<"vocabularioPersonal">;
      if (existente) {
        id = existente._id;
        await ctx.db.patch("vocabularioPersonal", id, {
          vecesVista: existente.vecesVista + 1,
          temas: existente.temas.includes(temaId) ? existente.temas : [...existente.temas, temaId].slice(-MAX_TEMAS_PALABRA),
          vistaEn: ahora,
          actualizadoEn: ahora,
          ...(elemento.costo ? {
            vecesCosto: existente.vecesCosto + 1,
            costoEn: ahora,
            ultimoCosto: elemento.evidencia || existente.ultimoCosto,
            dominio: Math.min(existente.dominio, 40),
            intervaloDias: 0,
            proximoRepasoEn: Math.min(existente.proximoRepasoEn, ahora),
          } : {}),
        });
      } else {
        id = await ctx.db.insert("vocabularioPersonal", {
          clave,
          texto: elemento.texto,
          tipo: elemento.tipo,
          nivel: elemento.nivel,
          traduccion: elemento.traduccion,
          significado: elemento.significado,
          ejemplo: elemento.ejemplo,
          temas: [temaId],
          vecesVista: 1,
          vecesCosto: elemento.costo ? 1 : 0,
          ultimoCosto: elemento.costo && elemento.evidencia ? elemento.evidencia : undefined,
          vistaEn: ahora,
          costoEn: elemento.costo ? ahora : undefined,
          dominio: 0,
          intervaloDias: 0,
          proximoRepasoEn: ahora,
          repasos: 0,
          creadoEn: ahora,
          actualizadoEn: ahora,
        });
      }
      if (elemento.costo) costosas.push(id);
    }

    const plan = await ctx.db.query("planesDiarios").withIndex("por_fecha", (q) => q.eq("fecha", args.fecha)).first();
    if (plan?.estado === "listo" && costosas.length) {
      const presentes = new Set(plan.palabras.map((palabra) => palabra.palabraId));
      const nuevas = costosas.filter((id) => !presentes.has(id)).map((palabraId) => ({ palabraId, prioridad: 3 }));
      if (nuevas.length) {
        await ctx.db.patch("planesDiarios", plan._id, { palabras: [...nuevas, ...plan.palabras].slice(0, MAX_PALABRAS_DIA), actualizadoEn: ahora });
      }
    }
    return null;
  },
});

export const prepararDia = action({
  args: { fecha: v.string(), nivel: v.union(nivelIngles, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!esFecha(args.fecha)) return null;
    const planId: Id<"planesDiarios"> | null = await ctx.runMutation(internal.aprendizaje.reservarPlanInterno, { fecha: args.fecha });
    if (!planId) return null;
    const ahora = Date.now();
    let palabras: { palabraId: Id<"vocabularioPersonal">; prioridad: number }[] = [];
    let tema: { temaId: Id<"temasConversacion">; motivo: MotivoTema } | undefined;
    let origen: "decisions" | "regla" = "regla";
    try {
      const candidatos: Candidatos = await ctx.runQuery(internal.aprendizaje.candidatosInterno, { ahora });
      const temas = candidatos.temas.filter((candidato) => candidato.ultimaFecha !== args.fecha);
      const lotes: CandidatoGuardado[][] = [];
      for (let inicio = 0; inicio < candidatos.palabras.length; inicio += TAMANO_LOTE) {
        lotes.push(candidatos.palabras.slice(inicio, inicio + TAMANO_LOTE));
      }
      const respuestas: unknown[] = [];
      const [necesidades, eleccion] = await Promise.all([
        Promise.all(lotes.map(async (lote) => {
          const datos = await consultarDecisions(entradaPrioridad(lote, args.nivel, ahora), preguntasPrioridad(lote), LIMITE_PLAN_MS);
          respuestas.push(datos);
          return datos ? leerPrioridades(datos, lote.length) : lote.map(() => null);
        })),
        temas.length
          ? consultarDecisions(entradaTema(temas, ahora), [preguntaTema(temas)], LIMITE_PLAN_MS).then((datos) => {
            respuestas.push(datos);
            return datos ? leerTema(datos, temas.length) : null;
          })
          : Promise.resolve(null),
      ]);
      await registrarUsoDecisions(ctx, respuestas, { fecha: args.fecha, concepto: "plan" });
      const lista = necesidades.flat();
      if (lista.some((valor) => valor !== null) || eleccion !== null) origen = "decisions";
      palabras = candidatos.palabras
        .map((candidato, indice) => ({ candidato, necesidad: lista[indice] ?? necesidadRegla(candidato, ahora), base: prioridadBase(candidato, ahora) }))
        .filter((item) => item.necesidad >= UMBRAL_NECESIDAD)
        .sort((a, b) => b.necesidad - a.necesidad || b.base - a.base)
        .slice(0, MAX_PALABRAS_DIA)
        .map((item) => ({ palabraId: item.candidato.id, prioridad: Math.round(item.necesidad * 100) / 100 }));
      const indice = eleccion ?? temaRegla(temas, ahora);
      if (indice !== "libre" && temas[indice]) tema = { temaId: temas[indice].id, motivo: elegirMotivo(temas[indice], ahora) };
    } finally {
      await ctx.runMutation(internal.aprendizaje.guardarPlanInterno, { planId, palabras, tema, origen });
    }
    return null;
  },
});

export const reservarPlanInterno = internalMutation({
  args: { fecha: v.string() },
  returns: v.union(v.id("planesDiarios"), v.null()),
  handler: async (ctx, args) => {
    const ahora = Date.now();
    const plan = await ctx.db.query("planesDiarios").withIndex("por_fecha", (q) => q.eq("fecha", args.fecha)).first();
    if (!plan) {
      return await ctx.db.insert("planesDiarios", { fecha: args.fecha, estado: "generando", palabras: [], origen: "regla", creadoEn: ahora, actualizadoEn: ahora });
    }
    if (plan.estado === "listo" || ahora - plan.actualizadoEn < RESERVA_MS) return null;
    await ctx.db.patch("planesDiarios", plan._id, { actualizadoEn: ahora });
    return plan._id;
  },
});

export const candidatosInterno = internalQuery({
  args: { ahora: v.number() },
  handler: async (ctx, args): Promise<Candidatos> => {
    const temasDocs = await ctx.db.query("temasConversacion").withIndex("por_ultima_sesion").order("desc").take(200);
    const nombres = new Map(temasDocs.map((tema) => [tema._id, tema.nombre]));
    const docs = await ctx.db.query("vocabularioPersonal").withIndex("por_vista").order("desc").take(500);
    const palabras: CandidatoGuardado[] = docs
      .map((doc) => ({
        id: doc._id,
        texto: doc.texto,
        traduccion: doc.traduccion,
        temas: doc.temas.flatMap((id) => nombres.get(id) ?? []),
        vecesVista: doc.vecesVista,
        vecesCosto: doc.vecesCosto,
        ultimoCosto: doc.ultimoCosto,
        costoEn: doc.costoEn,
        vistaEn: doc.vistaEn,
        dominio: doc.dominio,
        proximoRepasoEn: doc.proximoRepasoEn,
        repasos: doc.repasos,
      }))
      .filter((candidato) => necesidadRegla(candidato, args.ahora) > 0)
      .sort((a, b) => prioridadBase(b, args.ahora) - prioridadBase(a, args.ahora))
      .slice(0, MAX_CANDIDATOS);
    const temas: TemaGuardado[] = temasDocs.slice(0, MAX_TEMAS_SUGERENCIA).map((tema) => ({
      id: tema._id,
      nombre: tema.nombre,
      sesiones: tema.sesiones,
      dificultad: tema.dificultad,
      ultimaDificultad: tema.ultimaDificultad,
      ultimaSesionEn: tema.ultimaSesionEn,
      ultimaFecha: tema.ultimaFecha,
      palabras: docs
        .filter((doc) => doc.vecesCosto > 0 && doc.dominio < DOMINIO_DIFICIL && doc.temas.includes(tema._id))
        .slice(0, MAX_PALABRAS_TEMA)
        .map((doc) => doc.texto),
    }));
    return { palabras, temas };
  },
});

export const guardarPlanInterno = internalMutation({
  args: {
    planId: v.id("planesDiarios"),
    palabras: v.array(palabraPlan),
    tema: v.optional(temaPlan),
    origen: v.union(v.literal("decisions"), v.literal("regla")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await ctx.db.get("planesDiarios", args.planId);
    if (!plan) return null;
    await ctx.db.patch("planesDiarios", plan._id, {
      estado: "listo",
      palabras: args.palabras,
      tema: args.tema,
      origen: args.origen,
      actualizadoEn: Date.now(),
    });
    return null;
  },
});

export const planDelDia = query({
  args: { fecha: v.string() },
  returns: v.union(v.null(), v.object({
    estado: v.union(v.literal("generando"), v.literal("listo")),
    palabras: v.array(v.object({
      id: v.id("vocabularioPersonal"),
      texto: v.string(),
      tipo: tipoContenido,
      nivel: nivelIngles,
      traduccion: v.string(),
      significado: v.string(),
      ejemplo: v.string(),
      tema: v.string(),
      vecesCosto: v.number(),
      ultimoCosto: v.string(),
      dominio: v.number(),
      intervaloDias: v.number(),
      proximoRepasoEn: v.number(),
    })),
    tema: v.union(v.null(), v.object({ nombre: v.string(), motivo: motivoTema, practicado: v.boolean(), palabras: v.array(v.string()) })),
    otrosTemas: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const plan = await ctx.db.query("planesDiarios").withIndex("por_fecha", (q) => q.eq("fecha", args.fecha)).first();
    if (!plan) return null;
    const temasDocs = await ctx.db.query("temasConversacion").withIndex("por_ultima_sesion").order("desc").take(200);
    const nombres = new Map(temasDocs.map((tema) => [tema._id, tema.nombre]));
    const docs = await Promise.all(plan.palabras.map((palabra) => ctx.db.get("vocabularioPersonal", palabra.palabraId)));
    const palabras = docs.flatMap((doc) => doc ? [{
      id: doc._id,
      texto: doc.texto,
      tipo: doc.tipo,
      nivel: doc.nivel,
      traduccion: doc.traduccion,
      significado: doc.significado,
      ejemplo: doc.ejemplo,
      tema: nombres.get(doc.temas[doc.temas.length - 1]) ?? "Conversación general",
      vecesCosto: doc.vecesCosto,
      ultimoCosto: doc.ultimoCosto ?? "",
      dominio: doc.dominio,
      intervaloDias: doc.intervaloDias,
      proximoRepasoEn: doc.proximoRepasoEn,
    }] : []);
    const temaDoc = plan.tema ? await ctx.db.get("temasConversacion", plan.tema.temaId) : null;
    const tema = plan.tema && temaDoc ? {
      nombre: temaDoc.nombre,
      motivo: plan.tema.motivo,
      practicado: temaDoc.ultimaFecha === args.fecha,
      palabras: (await palabrasDificiles(ctx, temaDoc._id, MAX_PALABRAS_TEMA)).map((doc) => doc.texto),
    } : null;
    const otrosTemas = temasDocs
      .filter((doc) => doc._id !== temaDoc?._id && doc.dificultad >= DIFICULTAD_REFUERZO)
      .sort((a, b) => b.dificultad - a.dificultad)
      .slice(0, MAX_OTROS_TEMAS)
      .map((doc) => doc.nombre);
    return { estado: plan.estado, palabras, tema, otrosTemas };
  },
});

export const calificarPalabra = mutation({
  args: { id: v.id("vocabularioPersonal"), calificacion: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.calificacion) || args.calificacion < 0 || args.calificacion > 3) {
      throw new Error("La calificación del repaso no es válida.");
    }
    const doc = await ctx.db.get("vocabularioPersonal", args.id);
    if (!doc) return null;
    const ahora = Date.now();
    await ctx.db.patch("vocabularioPersonal", doc._id, {
      ...siguienteRepaso(doc, args.calificacion, ahora),
      repasos: doc.repasos + 1,
      actualizadoEn: ahora,
    });
    return null;
  },
});

export const contextoTutorInterno = internalQuery({
  args: { tema: v.string(), general: v.boolean() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const clave = normalizarClave(args.tema);
    const tema = clave ? await ctx.db.query("temasConversacion").withIndex("por_clave", (q) => q.eq("clave", clave)).first() : null;
    let palabras = tema ? await palabrasDificiles(ctx, tema._id, MAX_PALABRAS_REFUERZO) : [];
    if (!palabras.length && args.general) palabras = await palabrasDificiles(ctx, null, MAX_PALABRAS_REFUERZO);
    return instruccionRefuerzo(palabras.map((doc) => doc.texto));
  },
});
