import { query } from "./_generated/server";
import { v } from "convex/values";
import { ESCENARIOS_CONVERSACION } from "./conversacionEscenarios";

export const listar = query({
  args: {},
  returns: v.array(v.object({ id: v.string(), titulo: v.string(), subtitulo: v.string(), descripcion: v.string() })),
  handler: async () =>
    ESCENARIOS_CONVERSACION.map(({ id, titulo, subtitulo, descripcion }) => ({
      id,
      titulo,
      subtitulo,
      descripcion,
    })),
});
