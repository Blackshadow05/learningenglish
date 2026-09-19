export type ModoPractica = "profesor" | "libre" | "simulacion";
export type PapelEstudiante = "huesped" | "colaborador";
export type Correcciones = "durante" | "al_final" | "a_peticion";
export type ConfiguracionPractica = {
  modo: ModoPractica;
  papel: PapelEstudiante;
  correcciones: Correcciones;
  idiomaAyuda: "espanol" | "ingles";
  escucha: "automatica" | "pulsar";
  tema: string;
};

export const CONFIGURACION_INICIAL: ConfiguracionPractica = {
  modo: "libre", papel: "colaborador", correcciones: "al_final",
  idiomaAyuda: "espanol", escucha: "automatica", tema: "",
};

// Voice sessions are meant to last 10-15 minutes; end them automatically.
export const MINUTOS_SESION_VOZ = 15;

export const MODOS_PRACTICA = [
  { id: "libre", titulo: "Conversar", descripcion: "Cualquier tema, a tu ritmo.", icono: "headphones" },
  { id: "profesor", titulo: "Aprender", descripcion: "Explicaciones, ejemplos y ayuda.", icono: "book" },
  { id: "simulacion", titulo: "Simular", descripcion: "Situaciones y papeles reales.", icono: "briefcase" },
] as const;

export const NOMBRES_MODO: Record<ModoPractica, string> = {
  libre: "Conversación libre", profesor: "Profesor", simulacion: "Simulación",
};

// Storage is an optional convenience on this device, not an authenticated profile.
export function leerPreferencias(valor: unknown): ConfiguracionPractica {
  if (!valor || typeof valor !== "object") return { ...CONFIGURACION_INICIAL };
  const dato = valor as Record<string, unknown>;
  return {
    modo: dato.modo === "profesor" || dato.modo === "simulacion" ? dato.modo : "libre",
    papel: dato.papel === "huesped" ? "huesped" : "colaborador",
    correcciones: dato.correcciones === "durante" || dato.correcciones === "a_peticion" ? dato.correcciones : "al_final",
    idiomaAyuda: dato.idiomaAyuda === "ingles" ? "ingles" : "espanol",
    escucha: dato.escucha === "pulsar" ? "pulsar" : "automatica",
    // Topics and transcripts are deliberately not restored from browser storage.
    tema: "",
  };
}

export type ResumenPractica = {
  logro: { detalle: string; evidencia: string };
  correcciones: { original: string; mejora: string; explicacion: string }[];
  frase: string;
};
export type AccionAyuda = "mas_despacio" | "repetir" | "explicar" | "retomar" | "cambiar_papel";
