"use client";

import { useEffect, useState } from "react";
import { CONFIGURACION_INICIAL, leerPreferencias, MODOS_PRACTICA, type ConfiguracionPractica } from "../../lib/practice-config";
import { Icon } from "./icons";
import styles from "./practice.module.css";

const CLAVE = "bloom.voice.preferences.v1";
const CLAVE_PROVEEDOR = "bloom.voice.provider.v1";
export type ProveedorVoz = "gemini" | "openai";
export function usePreferenciasVoz() {
  const [configuracion, setConfiguracion] = useState<ConfiguracionPractica>(CONFIGURACION_INICIAL);
  const [proveedor, setProveedor] = useState<ProveedorVoz>("gemini");
  useEffect(() => {
    let activa = true;
    queueMicrotask(() => {
      if (!activa) return;
      try { setConfiguracion(leerPreferencias(JSON.parse(localStorage.getItem(CLAVE) ?? "null"))); } catch { /* Optional device storage. */ }
      try { const guardado = localStorage.getItem(CLAVE_PROVEEDOR); if (guardado === "openai" || guardado === "gemini") setProveedor(guardado); } catch { /* Optional device storage. */ }
    });
    return () => { activa = false; };
  }, []);
  function cambiar(cambios: Partial<ConfiguracionPractica>) {
    const siguiente = { ...configuracion, ...cambios };
    setConfiguracion(siguiente);
    try { localStorage.setItem(CLAVE, JSON.stringify({ ...siguiente, tema: "" })); } catch { /* Private mode or storage quota. */ }
  }
  function cambiarProveedor(siguiente: ProveedorVoz) {
    setProveedor(siguiente);
    try { localStorage.setItem(CLAVE_PROVEEDOR, siguiente); } catch { /* Private mode or storage quota. */ }
  }
  return { configuracion, cambiar, proveedor, cambiarProveedor };
}

export function PracticeSettings({ configuracion: c, cambiar, proveedor, cambiarProveedor, escenarios, escenarioId, elegirEscenario }: {
  configuracion: ConfiguracionPractica; cambiar: (c: Partial<ConfiguracionPractica>) => void;
  proveedor: ProveedorVoz; cambiarProveedor: (p: ProveedorVoz) => void;
  escenarios: { id: string; titulo: string }[] | undefined; escenarioId: string; elegirEscenario: (id: string) => void;
}) {
  return <div className={styles.setup}>
    <div className={styles.modes} role="group" aria-label="Tipo de práctica">
      {MODOS_PRACTICA.map(m => <button key={m.id} className={styles.modeCard} aria-pressed={c.modo === m.id} onClick={() => cambiar({ modo: m.id, tema: "", correcciones: m.id === "profesor" ? "durante" : "al_final" })}>
        <Icon name={m.icono} size={21}/><strong>{m.titulo}</strong><span>{m.descripcion}</span>
      </button>)}
    </div>
    <div className={styles.scenario}>
      <p className={styles.fieldLabel}>VOZ DEL TUTOR</p>
      <div className={styles.roles} role="group" aria-label="Modelo de voz del tutor">
        <button aria-pressed={proveedor === "gemini"} onClick={() => cambiarProveedor("gemini")}>Gemini 3.8 Live</button>
        <button aria-pressed={proveedor === "openai"} onClick={() => cambiarProveedor("openai")}>GPT Live 1</button>
      </div>
      <p className={styles.roleHint}>{proveedor === "gemini" ? "Voz de Google en tiempo real." : "Voz de OpenAI en tiempo real."}</p>
    </div>
    {c.modo === "simulacion" && <div className={styles.scenario}>
      <p className={styles.fieldLabel}>TU PAPEL</p>
      <div className={styles.roles} role="group" aria-label="Tu papel en la conversación">
        <button aria-pressed={c.papel === "huesped"} onClick={() => cambiar({ papel: "huesped" })}>Huésped</button>
        <button aria-pressed={c.papel === "colaborador"} onClick={() => cambiar({ papel: "colaborador" })}>Colaborador</button>
      </div>
      <p className={styles.roleHint}>Bloom será {c.papel === "huesped" ? "el colaborador" : "el huésped"}.</p>
      <label htmlFor="voice-scenario">LA SITUACIÓN</label>
      <div className={styles.scenarioSelect}><span><Icon name="briefcase" size={20}/></span><select id="voice-scenario" value={escenarioId} onChange={e => elegirEscenario(e.target.value)}>
        {!escenarios && <option value="">Preparando situaciones…</option>}
        {escenarios?.map(e => <option key={e.id} value={e.id}>{e.titulo}</option>)}
        <option value="personalizado">Crear mi situación</option>
      </select><Icon name="chevron" size={18}/></div>
    </div>}
    {(c.modo !== "simulacion" || escenarioId === "personalizado") && <div className={styles.topic}>
      <label htmlFor="voice-topic">{c.modo === "profesor" ? "¿Qué quieres aprender?" : c.modo === "simulacion" ? "Describe la situación" : "¿De qué te gustaría hablar?"} {c.modo !== "simulacion" && <span>Opcional</span>}</label>
      <textarea id="voice-topic" rows={2} maxLength={300} value={c.tema} onChange={e => cambiar({ tema: e.target.value })} placeholder={c.modo === "profesor" ? "Por ejemplo: cuándo usar do y does" : c.modo === "simulacion" ? "Un huésped quiere cambiar de habitación…" : "Viajes, música, tu día… tú eliges"}/>
    </div>}
    <details className={styles.preferences}>
      <summary><Icon name="settings" size={16}/>Ajustar mi experiencia<Icon name="chevron" size={15}/></summary>
      <label htmlFor="voice-corrections">Cuándo corregirme<select id="voice-corrections" value={c.correcciones} onChange={e => cambiar({ correcciones: e.target.value as ConfiguracionPractica["correcciones"] })}>
        <option value="durante">Durante la conversación</option><option value="al_final">Al terminar</option><option value="a_peticion">Solo si lo pido</option>
      </select></label>
      <label htmlFor="voice-language">Idioma de las explicaciones<select id="voice-language" value={c.idiomaAyuda} onChange={e => cambiar({ idiomaAyuda: e.target.value as ConfiguracionPractica["idiomaAyuda"] })}>
        <option value="espanol">Español</option><option value="ingles">Inglés</option>
      </select></label>
      <label htmlFor="voice-listening">Cómo quieres hablar<select id="voice-listening" value={c.escucha} onChange={e => cambiar({ escucha: e.target.value as ConfiguracionPractica["escucha"] })}>
        <option value="automatica">Manos libres</option><option value="pulsar">Mantener pulsado para hablar</option>
      </select></label>
      <p>{c.escucha === "pulsar" ? "Ideal con ruido: Bloom solo recibe audio mientras mantienes el botón pulsado." : "La escucha espera tus pausas. Si hay mucho ruido, prueba mantener pulsado."}</p>
    </details>
  </div>;
}
