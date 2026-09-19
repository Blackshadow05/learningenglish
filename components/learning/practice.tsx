"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Icon } from "./icons";
import { useLearning } from "./learning-provider";
import { useConversacionEnVivo } from "./live-conversation";
import type { MensajeConversacion } from "./live-session";
import styles from "./practice.module.css";

type Conversacion = ReturnType<typeof useConversacionEnVivo>;
type FaseVoz = "lista" | "conectando" | "escuchando" | "hablando" | "pensando" | "silenciada" | "error";

function Esfera({ fase, niveles }: { fase: FaseVoz; niveles?: Conversacion["niveles"] }) {
  const esfera = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!niveles || !esfera.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let volumen = 0;
    const elemento = esfera.current;
    const animar = () => {
      const siguiente = fase === "hablando" ? niveles.salida : fase === "escuchando" ? niveles.entrada : 0;
      volumen += (siguiente - volumen) * 0.18;
      elemento.style.setProperty("--voice-scale", String(1 + volumen * 0.16));
      elemento.style.setProperty("--voice-energy", String(volumen));
      frame = requestAnimationFrame(animar);
    };
    animar();
    return () => cancelAnimationFrame(frame);
  }, [fase, niveles]);
  return <div ref={esfera} className={styles.visualizer} data-phase={fase} aria-hidden="true">
    <div className={styles.halo}/>
    <div className={styles.orb}><div className={styles.orbFlow}/><div className={styles.orbLight}/></div>
    <div className={styles.wave}><i/><i/><i/><i/><i/></div>
  </div>;
}

function formatoDuracion(segundos: number) {
  return `${Math.floor(segundos / 60).toString().padStart(2, "0")}:${(segundos % 60).toString().padStart(2, "0")}`;
}

function Duracion({ inicio, fin }: { inicio: number | null; fin: number | null }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!inicio || fin) return;
    const timer = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [inicio, fin]);
  return <span className={styles.duration} aria-label="Duración de la conversación">{formatoDuracion(inicio ? Math.max(0, Math.floor(((fin ?? ahora) - inicio) / 1000)) : 0)}</span>;
}

function Transcripcion({ mensajes }: { mensajes: MensajeConversacion[] }) {
  const lista = useRef<HTMLDivElement>(null);
  const seguir = useRef(true);
  useEffect(() => {
    if (lista.current && seguir.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [mensajes]);
  return <div className={styles.transcript} id="voice-transcript" ref={lista} role="region" aria-label="Transcripción de la conversación" tabIndex={0} onScroll={() => {
    const el = lista.current;
    if (el) seguir.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }}>
    <p className={styles.transcriptHeading}>TRANSCRIPCIÓN EN VIVO</p>
    {!mensajes.length && <p className={styles.transcriptEmpty}>Lo que conversemos aparecerá aquí.</p>}
    {mensajes.map(mensaje => <div className={styles.transcriptMessage} key={mensaje.id} data-speaker={mensaje.rol}>
      <span>{mensaje.rol === "tutor" ? "Bloom" : "Tú"}</span>
      <p lang="en">{mensaje.texto}</p>
    </div>)}
  </div>;
}

function SalaVoz({ conversacion, titulo, terminar, reintentar }: {
  conversacion: Conversacion; titulo: string; terminar: () => void; reintentar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [subtitulos, setSubtitulos] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [texto, setTexto] = useState("");
  const { estado, error, micSilenciado, tutorHablando, estudianteHablando, esperandoRespuesta, mensajes, inicio, fin, niveles, silenciar, enviarTexto } = conversacion;
  const conectado = estado === "en_vivo";
  const fallida = estado === "error" || estado === "finalizada";
  const fase: FaseVoz = fallida ? "error" : !conectado ? "conectando" : tutorHablando ? "hablando" : estudianteHablando ? "escuchando" : esperandoRespuesta ? "pensando" : micSilenciado ? "silenciada" : "escuchando";
  const etiquetas: Record<FaseVoz, [string, string]> = {
    lista: ["Hablemos un rato", "Una conversación a tu ritmo."],
    conectando: ["Preparando tu conversación", "Permite el micrófono si tu navegador lo solicita."],
    escuchando: [estudianteHablando ? "Te escucho" : "Te toca a ti", "Habla con naturalidad. No tienes que pulsar nada."],
    hablando: ["Bloom está hablando", micSilenciado ? "Tu micrófono está silenciado." : "Puedes interrumpirme cuando quieras."],
    pensando: ["Un momento…", "Estoy preparando mi respuesta."],
    silenciada: ["Micrófono silenciado", "Actívalo cuando quieras seguir hablando."],
    error: ["Hagamos una pausa", error || "La conversación terminó. Puedes volver a conectar."],
  };

  useEffect(() => {
    const dialog = dialogo.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function alternarTexto() {
    if (!escribiendo) {
      silenciar(true);
      setSubtitulos(true);
    }
    setEscribiendo(!escribiendo);
  }

  return <dialog ref={dialogo} className={styles.room} aria-labelledby="voice-title" onCancel={evento => { evento.preventDefault(); terminar(); }}>
    <div className={styles.roomInner} data-expanded={subtitulos || escribiendo}>
      <header className={styles.roomHeader}>
        <div className={styles.roomBrand}><span className="brand-mark"><i/><i/><i/><i/></span><span>bloom<span className={styles.brandDot}>.</span><small>Modo de voz</small></span></div>
        <button className={styles.captionButton} type="button" aria-label={subtitulos ? "Ocultar transcripción" : "Mostrar transcripción"} aria-pressed={subtitulos} aria-controls="voice-transcript" onClick={() => setSubtitulos(!subtitulos)}><Icon name="captions" size={23}/></button>
      </header>
      <div className={styles.sessionMeta}><span><Icon name="headphones" size={14}/>{titulo}</span><Duracion inicio={inicio} fin={fin}/></div>
      <div className={styles.stage}>
        <Esfera fase={fase} niveles={niveles}/>
        <div className={styles.voiceStatus} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles.statusLabel}><span data-phase={fase}/>{fase === "error" ? "CONVERSACIÓN EN PAUSA" : fase === "conectando" ? "CONECTANDO" : "TÚ Y BLOOM"}</div>
          <h1 id="voice-title">{etiquetas[fase][0]}</h1>
          <p>{etiquetas[fase][1]}</p>
        </div>
        {fallida && <button className={styles.retryButton} onClick={reintentar}><Icon name="repeat" size={18}/>Volver a conectar</button>}
      </div>
      {subtitulos && <Transcripcion mensajes={mensajes}/>}
      {escribiendo && conectado && <form className={styles.composer} onSubmit={evento => {
        evento.preventDefault();
        if (enviarTexto(texto)) setTexto("");
      }}>
        <label className={styles.srOnly} htmlFor="voice-message">Mensaje para Bloom</label>
        <input id="voice-message" value={texto} onChange={evento => setTexto(evento.target.value)} placeholder="Escribe algo en inglés…" autoComplete="off" autoFocus/>
        <button type="submit" disabled={!texto.trim()} aria-label="Enviar mensaje"><Icon name="send" size={19}/></button>
      </form>}
      <footer className={styles.roomFooter}>
        <div className={styles.controls}>
          <div><button className={styles.controlButton} disabled={!conectado} onClick={alternarTexto} aria-label={escribiendo ? "Cerrar teclado" : "Escribir un mensaje"} aria-pressed={escribiendo}><Icon name="keyboard" size={23}/></button><span>Escribir</span></div>
          <div><button className={`${styles.controlButton} ${styles.micButton}`} data-muted={micSilenciado} disabled={!conectado} onClick={() => { silenciar(!micSilenciado); if (micSilenciado) setEscribiendo(false); }} aria-label={micSilenciado ? "Activar micrófono" : "Silenciar micrófono"} aria-pressed={micSilenciado}><Icon name={micSilenciado ? "mic-off" : "mic"} size={27}/></button><span>{micSilenciado ? "Activar" : "Silenciar"}</span></div>
          <div><button className={`${styles.controlButton} ${styles.endButton}`} onClick={terminar} aria-label={estado === "conectando" ? "Cancelar conexión" : "Terminar conversación"}><Icon name="close" size={27}/></button><span>{estado === "conectando" ? "Cancelar" : "Terminar"}</span></div>
        </div>
        <p>{escribiendo ? "El micrófono está silenciado mientras escribes." : "Un espacio para hablar, escuchar y volver a intentar."}</p>
      </footer>
    </div>
  </dialog>;
}

export function Practice() {
  const { level } = useLearning();
  const escenarios = useQuery(api.escenarios.listar);
  const conversacion = useConversacionEnVivo();
  const [escenarioId, setEscenarioId] = useState("");
  const [salaAbierta, setSalaAbierta] = useState(false);
  const [resumen, setResumen] = useState<{ duracion: number; turnos: number } | null>(null);
  const [verResumen, setVerResumen] = useState(false);
  const escenario = escenarios?.find(item => item.id === escenarioId) ?? escenarios?.[0];

  function comenzar() {
    if (!escenario) return;
    setResumen(null);
    setSalaAbierta(true);
    setVerResumen(false);
    void conversacion.iniciar(escenario.id, level);
  }
  function terminar() {
    const turnos = conversacion.mensajes.filter(mensaje => mensaje.rol === "estudiante").length;
    if (conversacion.inicio && turnos) {
      setResumen({ duracion: Math.floor(((conversacion.fin ?? Date.now()) - conversacion.inicio) / 1000), turnos });
    }
    conversacion.finalizar();
    setSalaAbierta(false);
  }

  return <div className={styles.practice}>
    {resumen ? <section className={styles.summary}>
      <div className={styles.summaryIcon}><Icon name="check" size={30}/></div>
      <p className={styles.eyebrow}>UN POCO MÁS DE CONFIANZA</p>
      <h1>Hoy te animaste<br/>a hablar.</h1>
      <p>Cada conversación cuenta. Sigue a tu ritmo.</p>
      <div className={styles.summaryStats}><div><strong>{formatoDuracion(resumen.duracion)}</strong><span>conversando</span></div><div><strong>{resumen.turnos}</strong><span>{resumen.turnos === 1 ? "intervención tuya" : "intervenciones tuyas"}</span></div></div>
      <button className={styles.startButton} onClick={comenzar}><Icon name="mic" size={20}/>Volver a conversar</button>
      <button className={styles.secondaryButton} onClick={() => setResumen(null)}>Elegir otra situación<Icon name="arrow" size={17}/></button>
      <button className={styles.transcriptToggle} aria-expanded={verResumen} onClick={() => setVerResumen(!verResumen)}><Icon name="captions" size={18}/>{verResumen ? "Ocultar conversación" : "Ver conversación"}</button>
      {verResumen && <Transcripcion mensajes={conversacion.mensajes}/>}
    </section> : <>
      <section className={styles.heading}>
        <p className={styles.eyebrow}>CONVERSA CON BLOOM</p>
        <h1>Todo empieza<br/>con un <em>hola.</em></h1>
        <p>Habla, escucha y deja que la conversación fluya.</p>
      </section>
      <div className={styles.preview}><Esfera fase="lista"/><span className={styles.voiceBadge}><span/>Voz en tiempo real</span></div>
      <div className={styles.scenario}>
        <label htmlFor="voice-scenario">HOY PRACTICAMOS</label>
        <div className={styles.scenarioSelect}><span><Icon name="briefcase" size={21}/></span><select id="voice-scenario" value={escenario?.id ?? ""} disabled={!escenarios?.length} onChange={evento => setEscenarioId(evento.target.value)}>
          {!escenarios?.length && <option value="">{escenarios ? "Sin situaciones disponibles" : "Preparando situaciones…"}</option>}
          {escenarios?.map(item => <option key={item.id} value={item.id}>{item.titulo}</option>)}
        </select><Icon name="chevron" size={18}/></div>
        <p>{escenario?.subtitulo ?? "Estamos preparando tu próxima conversación."}</p>
      </div>
      <button className={styles.startButton} disabled={!escenario} onClick={comenzar}><Icon name="mic" size={21}/>Empezar a hablar<Icon name="arrow" size={19}/></button>
      <p className={styles.startNote}>Activa el micrófono una vez. Después, solo conversa.</p>
      <div className={styles.features}><span><Icon name="headphones" size={16}/>A tu ritmo</span><span className={styles.featureDot}/><span><Icon name="sparkles" size={16}/>Sin presión</span></div>
    </>}
    {salaAbierta && <SalaVoz conversacion={conversacion} titulo={escenario?.titulo ?? "Conversación"} terminar={terminar} reintentar={comenzar}/>}
  </div>;
}
