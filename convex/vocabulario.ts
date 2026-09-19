import { query } from "./_generated/server";
import { v } from "convex/values";
import { nivelBasico } from "./schema";

function intercalarPorNivel<T>(listas: T[][]): T[] {
  const resultado: T[] = [];
  const maximo = Math.max(0, ...listas.map((lista) => lista.length));
  for (let indice = 0; indice < maximo; indice += 1) {
    for (const lista of listas) {
      if (indice < lista.length) resultado.push(lista[indice]);
    }
  }
  return resultado;
}

function generarAleatorio(semilla: number) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let valor = estado;
    valor = Math.imul(valor ^ (valor >>> 15), valor | 1);
    valor ^= valor + Math.imul(valor ^ (valor >>> 7), valor | 61);
    return ((valor ^ (valor >>> 14)) >>> 0) / 4294967296;
  };
}

function rotar<T>(items: T[], dia: number, cantidad: number): T[] {
  if (items.length <= cantidad) return [...items];
  const copia = [...items];
  const aleatorio = generarAleatorio(dia + 1);
  for (let indice = copia.length - 1; indice > 0; indice -= 1) {
    const destino = Math.floor(aleatorio() * (indice + 1));
    const temporal = copia[indice];
    copia[indice] = copia[destino];
    copia[destino] = temporal;
  }
  return copia.slice(0, cantidad);
}

export const obtenerPlanDiario = query({
  args: {
    niveles: v.array(nivelBasico),
    dia: v.number(),
    cantidadPalabras: v.number(),
    cantidadFrases: v.number(),
  },
  handler: async (ctx, args) => {
    const palabrasPorNivel = [];
    for (const nivel of args.niveles) {
      const palabras = await ctx.db
        .query("vocabulario")
        .withIndex("por_nivel_basico_y_activo", (q) =>
          q.eq("nivelBasico", nivel).eq("activo", true)
        )
        .collect();
      palabrasPorNivel.push(palabras);
    }

    const frasesPorNivel = [];
    for (const nivel of args.niveles) {
      const frases = await ctx.db
        .query("frases")
        .withIndex("por_nivel_basico_y_activo", (q) =>
          q.eq("nivelBasico", nivel).eq("activo", true)
        )
        .collect();
      frasesPorNivel.push(frases);
    }

    return {
      palabras: rotar(
        intercalarPorNivel(palabrasPorNivel),
        args.dia,
        args.cantidadPalabras
      ),
      frases: rotar(
        intercalarPorNivel(frasesPorNivel),
        args.dia,
        args.cantidadFrases
      ),
    };
  },
});
