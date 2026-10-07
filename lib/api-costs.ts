export const CONCEPTOS_GASTO = ["voz", "transcripcion", "apoyo", "decisiones", "vocabulario", "plan", "eleccion_voz"] as const;
export type ConceptoGasto = (typeof CONCEPTOS_GASTO)[number];
export type ProveedorGasto = "gemini" | "openai" | "mini";

export type Uso = {
  entradaTexto: number;
  entradaTextoCache: number;
  escrituraCache: number;
  entradaAudio: number;
  entradaAudioCache: number;
  entradaImagen: number;
  salidaTexto: number;
  salidaAudio: number;
  segundos: number;
};

export type ConsumoSesion = { concepto: ConceptoGasto; modelo: string; uso: Uso; llamadas: number };
export type SesionGasto = {
  sesionId: string;
  fecha: string;
  proveedor: ProveedorGasto;
  modelo: string;
  modo: string;
  tema: string;
  inicio: number;
  duracionSegundos: number;
  turnos: number;
  consumos: ConsumoSesion[];
};

export const USO_VACIO: Uso = {
  entradaTexto: 0, entradaTextoCache: 0, escrituraCache: 0, entradaAudio: 0, entradaAudioCache: 0,
  entradaImagen: 0, salidaTexto: 0, salidaAudio: 0, segundos: 0,
};

const TARIFAS: { prefijo: string; tarifa: Partial<Uso> }[] = [
  { prefijo: "gpt-realtime-2.1-mini", tarifa: { entradaTexto: 0.6, entradaTextoCache: 0.06, entradaAudio: 10, entradaAudioCache: 0.3, entradaImagen: 0.8, salidaTexto: 2.4, salidaAudio: 20 } },
  { prefijo: "gpt-live-1", tarifa: { segundos: 0.05 / 60 } },
  { prefijo: "gpt-6-luna", tarifa: { entradaTexto: 0.1, entradaTextoCache: 0.01, escrituraCache: 0.125, salidaTexto: 0.5 } },
  { prefijo: "gpt-4o-mini-transcribe", tarifa: { entradaTexto: 1.25, entradaAudio: 1.25, salidaTexto: 5 } },
  { prefijo: "gemini-3.8-live", tarifa: { entradaTexto: 0.75, entradaAudio: 3, entradaImagen: 1, salidaTexto: 4.5, salidaAudio: 12 } },
];

export const NOMBRES_CONCEPTO: Record<ConceptoGasto, string> = {
  voz: "Voz del tutor",
  transcripcion: "Transcripción de tu voz",
  apoyo: "Apoyo de GPT-6 Luna",
  decisiones: "Tutor adaptativo (Decisions)",
  vocabulario: "Vocabulario de la sesión",
  plan: "Plan diario de vocabulario",
  eleccion_voz: "Elección automática de voz",
};

export const NOMBRES_PROVEEDOR: Record<ProveedorGasto, string> = {
  gemini: "Gemini 3.8 Live",
  openai: "GPT Live 1",
  mini: "Realtime Mini",
};

function n(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : 0;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

export function costoUso(modelo: string, uso: Uso): number {
  const tarifa = TARIFAS.find(({ prefijo }) => modelo.startsWith(prefijo))?.tarifa;
  if (!tarifa) return 0;
  return (Object.keys(tarifa) as (keyof Uso)[]).reduce(
    (suma, campo) => suma + (uso[campo] * (tarifa[campo] ?? 0)) / (campo === "segundos" ? 1 : 1e6),
    0
  );
}

export function sumarUso(a: Uso, b: Uso): Uso {
  return (Object.keys(USO_VACIO) as (keyof Uso)[]).reduce((suma, campo) => ({ ...suma, [campo]: a[campo] + b[campo] }), USO_VACIO);
}

export function hayUso(uso: Uso): boolean {
  return (Object.keys(USO_VACIO) as (keyof Uso)[]).some((campo) => uso[campo] > 0);
}

export function usoRealtime(usage: unknown): Uso {
  const datos = objeto(usage);
  const entrada = objeto(datos.input_token_details);
  const cache = objeto(entrada.cached_tokens_details);
  const salida = objeto(datos.output_token_details);
  return {
    ...USO_VACIO,
    entradaTexto: Math.max(0, n(entrada.text_tokens) - n(cache.text_tokens)),
    entradaTextoCache: n(cache.text_tokens),
    entradaAudio: Math.max(0, n(entrada.audio_tokens) - n(cache.audio_tokens)),
    entradaAudioCache: n(cache.audio_tokens),
    entradaImagen: Math.max(0, n(entrada.image_tokens) - n(cache.image_tokens)),
    salidaTexto: n(salida.text_tokens),
    salidaAudio: n(salida.audio_tokens),
  };
}

export function usoTranscripcion(usage: unknown): Uso {
  const datos = objeto(usage);
  if (datos.type === "duration") return { ...USO_VACIO, segundos: n(datos.seconds) };
  const entrada = objeto(datos.input_token_details);
  const texto = n(entrada.text_tokens);
  const audio = n(entrada.audio_tokens) || Math.max(0, n(datos.input_tokens) - texto);
  return { ...USO_VACIO, entradaTexto: texto, entradaAudio: audio, salidaTexto: n(datos.output_tokens) };
}

export function usoRespuestas(usage: unknown): Uso {
  const datos = objeto(usage);
  const detalle = objeto(datos.input_tokens_details);
  const cache = n(detalle.cached_tokens);
  const escritura = n(detalle.cache_write_tokens);
  return {
    ...USO_VACIO,
    entradaTexto: Math.max(0, n(datos.input_tokens) - cache - escritura),
    entradaTextoCache: cache,
    escrituraCache: escritura,
    salidaTexto: n(datos.output_tokens),
  };
}

function porModalidad(lista: unknown, ...modalidades: string[]): number {
  if (!Array.isArray(lista)) return 0;
  return lista.reduce((suma: number, item) => (modalidades.includes(String(objeto(item).modality)) ? suma + n(objeto(item).tokenCount) : suma), 0);
}

export function usoGemini(metadatos: unknown): Uso {
  const datos = objeto(metadatos);
  const entradaAudio = porModalidad(datos.promptTokensDetails, "AUDIO");
  const entradaImagen = porModalidad(datos.promptTokensDetails, "IMAGE", "VIDEO");
  const salidaAudio = porModalidad(datos.responseTokensDetails, "AUDIO");
  return {
    ...USO_VACIO,
    entradaTexto: Math.max(0, n(datos.promptTokenCount) + n(datos.toolUsePromptTokenCount) - entradaAudio - entradaImagen),
    entradaAudio,
    entradaImagen,
    salidaTexto: Math.max(0, n(datos.responseTokenCount) - salidaAudio) + n(datos.thoughtsTokenCount),
    salidaAudio,
  };
}

export function fechaUtc(momento = Date.now()): string {
  return new Date(momento).toISOString().slice(0, 10);
}

export function diasAnteriores(fecha: string, cantidad: number): string[] {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return Array.from({ length: cantidad }, (_, indice) => {
    const actual = new Date(anio, mes - 1, dia - indice);
    return `${actual.getFullYear()}-${String(actual.getMonth() + 1).padStart(2, "0")}-${String(actual.getDate()).padStart(2, "0")}`;
  });
}

export function formatoDolares(valor: number): string {
  if (valor <= 0) return "$0";
  if (valor < 0.001) return "<$0.001";
  return `$${valor < 1 ? valor.toFixed(3) : valor.toFixed(2)}`;
}
