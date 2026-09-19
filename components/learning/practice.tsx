"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Icon, type IconName } from "./icons";
import { useLearning } from "./learning-provider";
import { useConversacionEnVivo } from "./live-conversation";

const iconosEscenario: Record<string, IconName> = {
  llegada_huesped: "home",
  indicaciones_recepcion: "target",
  estacionamiento_transporte: "arrow",
};

const modelosVoz = [
  { nombre: "Gemini 3.8 Live", disponible: true },
  { nombre: "GPT Live 1", disponible: false },
];

export function Practice() {
  const { provider, setProvider, level, speak } = useLearning();
  const escenarios = useQuery(api.escenarios.listar);
  const {
    estado,
    mensajes,
    error,
    micActivo,
    micError,
    micSilenciado,
    tutorHablando,
    iniciar,
    finalizar,
    enviarTexto,
    alternarMicrofono,
  } = useConversacionEnVivo();
  const [escenarioId, setEscenarioId] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [finished, setFinished] = useState(false);
  const [texto, setTexto] = useState("");
  const [modoTexto, setModoTexto] = useState(false);
  const escenario =
    escenarios?.find((item) => item.id === escenarioId) ?? escenarios?.[0] ?? null;
  const enVivo = estado === "en_vivo" || estado === "conectando";
  const puedeIniciar = escenario !== null && provider === "Gemini 3.8 Live";
  const ultimoTutor = [...mensajes].reverse().find((mensaje) => mensaje.rol === "tutor");

  function comenzar() {
    if (!escenario) return;
    setPanelAbierto(true);
    setFinished(false);
    setModoTexto(false);
    void iniciar(escenario.id, level);
  }
  function terminar() {
    finalizar();
    setPanelAbierto(false);
    setFinished(true);
  }
  function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    enviarTexto(limpio);
    setTexto("");
  }
  return <>
    <section className="page-heading">
      <div className="eyebrow">AQUÍ PUEDES EQUIVOCARTE</div>
      <h1>Más conversación.<br/>Más confianza<span className="purple-text">.</span></h1>
      <p>Tu espacio para soltar el inglés, sin presión.</p>
    </section>
    <div className="provider-control">
      <span>Tu compañero de voz</span>
      <div className="provider-switch" aria-label="Modelo de voz">
        {modelosVoz.map(modelo => <button key={modelo.nombre} className={provider === modelo.nombre ? "active" : ""} disabled={enVivo || !modelo.disponible} onClick={() => setProvider(modelo.nombre)} aria-pressed={provider === modelo.nombre}><Icon name="sparkles" size={16}/>{modelo.nombre}</button>)}
      </div>
      <span className="provider-note">{provider === "Gemini 3.8 Live" ? "Voz en tiempo real · GPT Live 1 llegará después" : "GPT Live 1 todavía no está conectado"}</span>
    </div>
    {!panelAbierto && !finished && <>
      <div className="voice-stage">
        <div className="voice-orbit"><div className="voice-orb"><Icon name="mic" size={38}/></div><span className="orb-star star-one">✦</span><span className="orb-star star-two">✦</span></div>
        <h2>Tenemos mucho de qué hablar.</h2>
        <p>Elige una situación de hotel y habla con Gemini en tiempo real.</p>
        <span className="tag purple-tag">{level ?? "Tu nivel"} · Conversación real</span>
      </div>
      <div className="section-heading"><h2>¿Por dónde empezamos?</h2></div>
      <div className="scenario-list">
        {(escenarios ?? []).map(item => <button key={item.id} className={`scenario-option ${escenario?.id === item.id ? "selected" : ""}`} aria-pressed={escenario?.id === item.id} onClick={() => setEscenarioId(item.id)}><span className="feature-icon"><Icon name={iconosEscenario[item.id] ?? "globe"} size={22}/></span><span><strong>{item.titulo}</strong><small>{item.subtitulo}</small></span><span className="radio-dot">{escenario?.id === item.id && <i/>}</span></button>)}
        {!escenarios && <p className="loading-message">Preparando escenarios…</p>}
      </div>
      <button className="button purple-button full" disabled={!puedeIniciar} onClick={comenzar}><Icon name="mic" size={20}/>Empezar a conversar</button>
      <p className="fine-print">Voz en tiempo real · necesitarás permitir el micrófono (también puedes escribir)</p>
    </>}
    {panelAbierto && <section className="conversation-panel">
      <div className="conversation-header">
        <span className="live-dot"/>
        <div>
          <strong>{escenario?.titulo ?? "Conversación"}</strong>
          <span>{estado === "conectando" ? "Conectando con Gemini…" : estado === "en_vivo" ? `${provider} · ${micActivo ? (micSilenciado ? "micrófono en silencio" : "te escucho por voz") : "modo texto"}` : estado === "error" ? "La sesión se detuvo" : "Sesión finalizada"}</span>
        </div>
        <button className="icon-button" aria-label="Terminar conversación" onClick={terminar}><Icon name="close"/></button>
      </div>
      <div className="transcript" aria-live="polite">
        {!mensajes.length && <div className="message feedback"><span className="message-label">Bloom</span><p lang="es">{estado === "conectando" ? "Un momento, estoy preparando la sala…" : estado === "error" ? "No pudimos conectar. Revisa la clave de Gemini y vuelve a intentarlo." : micError ? micError : "Empieza a hablar cuando quieras; tu tutor de hotel te responderá por voz."}</p></div>}
        {micError && mensajes.length > 0 && <div className="message feedback"><span className="message-label">Micrófono</span><p lang="es">{micError}</p></div>}
        {mensajes.map(mensaje => <div className={`message ${mensaje.rol === "tutor" ? "ai" : "user"}`} key={mensaje.id}><span className="message-label">{mensaje.rol === "tutor" ? "Bloom" : "Tú"}</span><p lang="en">{mensaje.texto}</p>{mensaje.rol === "tutor" && <button className="text-button" onClick={() => speak(mensaje.texto)}><Icon name="volume" size={16}/>Escuchar texto</button>}</div>)}
        {tutorHablando && <div className="message ai"><span className="message-label">Bloom</span><p className="muted">Hablando…</p></div>}
        {error && <div className="message feedback" role="alert"><span className="message-label">Aviso</span><p lang="es">{error}</p></div>}
      </div>
      {micActivo && !modoTexto ? <div className="reply-options">
        <p className="eyebrow" role="status">{estado === "en_vivo" ? (micSilenciado ? "MICRÓFONO EN SILENCIO" : "TE ESCUCHO · HABLA CUANDO QUIERAS") : "PREPARANDO EL MICRÓFONO"}</p>
        <button className="button purple-button full" type="button" onClick={alternarMicrofono} disabled={estado !== "en_vivo"}>{micSilenciado ? <><Icon name="mic" size={18}/>Activar micrófono</> : <><Icon name="pause" size={18}/>Silenciar micrófono</>}</button>
        <p className="fine-print">Habla con naturalidad y espera la respuesta en voz alta; puedes interrumpir al tutor hablando.</p>
        <button className="text-button skip" type="button" onClick={() => setModoTexto(true)}>Prefiero escribir en su lugar</button>
        <button className="button secondary full" type="button" onClick={terminar}>Terminar práctica<Icon name="check" size={18}/></button>
      </div> : <form className="reply-options" onSubmit={evento => { evento.preventDefault(); enviar(); }}>
        <label className="search-field">
          <Icon name="send" size={18}/>
          <input value={texto} onChange={evento => setTexto(evento.target.value)} placeholder="Escribe en inglés para el tutor" aria-label="Mensaje para el tutor" disabled={estado !== "en_vivo"}/>
        </label>
        <button className="button purple-button full" type="submit" disabled={estado !== "en_vivo" || !texto.trim()}>Enviar mensaje<Icon name="send" size={18}/></button>
        {micActivo && <button className="text-button skip" type="button" onClick={() => setModoTexto(false)}>Volver a hablar por voz</button>}
        <button className="button secondary full" type="button" onClick={terminar}>Terminar práctica<Icon name="check" size={18}/></button>
      </form>}
    </section>}
    {finished && <div className="session-summary">
      <div className="modal-emblem lilac-icon"><Icon name="sparkles" size={30}/></div>
      <h2>Ya diste el primer paso.</h2>
      <p>Así se siente practicar: hablar, recibir una corrección natural y volver a intentarlo.</p>
      {ultimoTutor && <div className="example-box"><span className="eyebrow">UNA FRASE PARA LLEVARTE</span><h3 lang="en">{ultimoTutor.texto}</h3><button className="text-button" onClick={() => speak(ultimoTutor.texto)}><Icon name="volume" size={18}/>Escuchar otra vez</button></div>}
      <button className="button purple-button full" onClick={() => setFinished(false)}>Probar otra situación<Icon name="arrow" size={18}/></button>
    </div>}
    <div className="soft-note"><Icon name="book"/><span>Conversación con Gemini 3.8 Live: dudas del idioma, speaking, listening y correcciones que te ayudan a avanzar.</span></div>
  </>;
}
