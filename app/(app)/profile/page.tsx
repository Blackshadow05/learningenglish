import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Perfil",
};

export default function ProfilePage() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Cuenta, progreso y ajustes.
      </p>
    </div>
  );
}
