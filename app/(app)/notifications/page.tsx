import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Avisos",
};

export default function NotificationsPage() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Avisos</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Notificaciones y actividad reciente.
      </p>
    </div>
  );
}
