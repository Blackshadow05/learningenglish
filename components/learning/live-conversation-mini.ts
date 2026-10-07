"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ConversacionLive } from "./live-session";
import { conectarRealtimeMini } from "./realtime-mini";
import type { Conversacion } from "./live-conversation";
import { solicitudRegistro } from "../../lib/learning-memory";

export function useConversacionMini(): Conversacion {
  const prepararSesion = useAction(api.conversacionMini.prepararSesionMini);
  const ejecutarHerramienta = useAction(api.conversacionMini.ejecutarHerramientaMini);
  const evaluarTurno = useAction(api.decisiones.evaluarTurno);
  const procesarSesion = useAction(api.aprendizaje.procesarSesion);
  const registrarSesionVoz = useMutation(api.gastos.registrarSesionVoz);
  const [conversacion] = useState(() => {
    let nivelActual: "sin_evaluar" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null = null;
    return new ConversacionLive({
      crearToken: (args) => {
        nivelActual = args.nivel;
        return prepararSesion({ ...args, turnosCliente: true });
      },
      conectar: (datos, callbacks, preferencias, transporte) =>
        conectarRealtimeMini(datos, callbacks, transporte, (args) => ejecutarHerramienta({ ...args, nivel: nivelActual }), preferencias.escucha === "pulsar"),
      transcripcion: { estudiante: false, tutor: true },
      decidir: (args) => evaluarTurno(args),
      registrar: (registro) => { void procesarSesion(solicitudRegistro(registro)).catch(() => {}); },
      gasto: { proveedor: "mini", registrar: (sesion) => { void registrarSesionVoz(sesion).catch(() => {}); } },
    });
  });
  const snapshot = useSyncExternalStore(conversacion.subscribe, conversacion.getSnapshot, conversacion.getSnapshot);

  useEffect(() => {
    const salir = () => conversacion.finalizar();
    window.addEventListener("pagehide", salir);
    return () => {
      window.removeEventListener("pagehide", salir);
      conversacion.finalizar();
    };
  }, [conversacion]);

  return {
    ...snapshot,
    niveles: conversacion.niveles,
    iniciar: conversacion.iniciar,
    finalizar: conversacion.finalizar,
    enviarTexto: conversacion.enviarTexto,
    silenciar: conversacion.silenciar,
    pulsar: conversacion.pulsar,
    ayudar: conversacion.ayudar,
    cerrarConResumen: conversacion.cerrarConResumen,
  };
}
