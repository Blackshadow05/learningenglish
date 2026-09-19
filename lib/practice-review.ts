import type { ResumenPractica } from "./practice-config";

export function validarResumen(valor: unknown, intervenciones: string[]): ResumenPractica | null {
  if (!valor || typeof valor !== "object") return null;
  const r = valor as ResumenPractica;
  const texto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 1000;
  const normalizar = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  const citado = (v: unknown): v is string => texto(v) && intervenciones.some(t => normalizar(t).includes(normalizar(v)));
  if (!r.logro || !texto(r.logro.detalle) || !citado(r.logro.evidencia) || !texto(r.frase) || !Array.isArray(r.correcciones)) return null;
  return {
    logro: { detalle: r.logro.detalle, evidencia: r.logro.evidencia }, frase: r.frase,
    correcciones: r.correcciones.filter(c => c && citado(c.original) && texto(c.mejora) && texto(c.explicacion)).slice(0, 2)
      .map(c => ({ original: c.original, mejora: c.mejora, explicacion: c.explicacion })),
  };
}
