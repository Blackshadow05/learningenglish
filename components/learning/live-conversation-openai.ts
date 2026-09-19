"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ConversacionLive } from "./live-session";
import { conectarRealtimeOpenAI } from "./openai-realtime";
import type { Conversacion } from "./live-conversation";

export function useConversacionOpenAI(): Conversacion {
  const crearToken = useAction(api.conversacionOpenai.crearTokenRealtime);
  const [conversacion] = useState(() => new ConversacionLive({
    crearToken,
    conectar: (datos, callbacks, preferencias, transporte) => conectarRealtimeOpenAI(datos, callbacks, preferencias, transporte),
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
