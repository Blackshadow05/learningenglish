"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ConversacionLive } from "./live-session";
import { conectarGptLive } from "./gpt-live";
import type { Conversacion } from "./live-conversation";

export function useConversacionOpenAI(): Conversacion {
  const prepararSesion = useAction(api.conversacionOpenai.prepararSesionLive);
  const crearSesionWebrtc = useAction(api.conversacionOpenai.crearSesionWebrtc);
  const [conversacion] = useState(() => new ConversacionLive({
    crearToken: (args) => prepararSesion(args),
    conectar: (datos, callbacks, _preferencias, transporte) => conectarGptLive(datos, callbacks, transporte, (args) => crearSesionWebrtc(args)),
    transcripcion: { estudiante: false, tutor: false },
  }));
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
