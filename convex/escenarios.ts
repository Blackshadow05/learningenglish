import { query } from "./_generated/server";
import { ESCENARIOS_CONVERSACION } from "./conversacionEscenarios";

export const listar = query({
  args: {},
  handler: async () =>
    ESCENARIOS_CONVERSACION.map(({ id, titulo, subtitulo, descripcion }) => ({
      id,
      titulo,
      subtitulo,
      descripcion,
    })),
});
