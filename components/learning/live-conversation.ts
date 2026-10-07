"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAction, useMutation } from "convex/react";
import { GoogleGenAI } from "@google/genai";
import { api } from "../../convex/_generated/api";
import { ConversacionLive } from "./live-session";
import { configuracionLive } from "./live-config";
import { solicitudRegistro } from "../../lib/learning-memory";

export type Conversacion = ReturnType<typeof useConversacionEnVivo>;

export function useConversacionEnVivo() {
  const crearToken = useAction(api.conversacion.crearTokenLive);
  const evaluarTurno = useAction(api.decisiones.evaluarTurno);
  const procesarSesion = useAction(api.aprendizaje.procesarSesion);
  const registrarSesionVoz = useMutation(api.gastos.registrarSesionVoz);
  const [conversacion] = useState(() => new ConversacionLive({
    crearToken,
    decidir: (args) => evaluarTurno(args),
    registrar: (registro) => { void procesarSesion(solicitudRegistro(registro)).catch(() => {}); },
    gasto: { proveedor: "gemini", registrar: (sesion) => { void registrarSesionVoz(sesion).catch(() => {}); } },
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
