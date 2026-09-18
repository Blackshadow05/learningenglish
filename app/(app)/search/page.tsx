import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buscar",
};

export default function SearchPage() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Buscar</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Búsqueda con resultados en streaming.
      </p>
    </div>
  );
}
