"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAction } from "convex/react";
import { GoogleGenAI } from "@google/genai";
import { api } from "../../convex/_generated/api";
import { ConversacionLive } from "./live-session";
import { configuracionLive } from "./live-config";

export function useConversacionEnVivo() {
  const crearToken = useAction(api.conversacion.crearTokenLive);
  const [conversacion] = useState(() => new ConversacionLive({
    crearToken,
    conectar: (datos, callbacks, preferencias) => new GoogleGenAI({
      apiKey: datos.token,
      apiVersion: "v1alpha",
    }).live.connect({
      model: datos.modelo,
      config: configuracionLive(datos.instruccion, datos.voz, preferencias),
      callbacks,
    }),
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
