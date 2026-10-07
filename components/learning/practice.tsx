"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Icon } from "./icons";
import { useLearning } from "./learning-provider";
import { useConversacionEnVivo } from "./live-conversation";
import { useConversacionOpenAI } from "./live-conversation-openai";
import { useConversacionMini } from "./live-conversation-mini";
import type { MensajeConversacion } from "./live-session";
import { NOMBRES_MODO } from "../../lib/practice-config";
import { vozPorDefecto, type NivelPerfil, type VozAutomatica } from "../../lib/practice-decisions";
import { datosProveedor, PracticeSettings, usePreferenciasVoz, type VozConcreta } from "./practice-settings";
import type { TemaSugerido } from "./demo-data";
import { enFrase, fechaLocal } from "../../lib/learning-memory";
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

function segundosTranscurridos(inicio: number, fin: number | null) {
  return Math.floor(((fin ?? Date.now()) - inicio) / 1000);
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

function Transcripcion({ mensajes, soloTutor = false }: { mensajes: MensajeConversacion[]; soloTutor?: boolean }) {
  const lista = useRef<HTMLDivElement>(null);
  const seguir = useRef(true);
  useEffect(() => {
    if (lista.current && seguir.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [mensajes]);
  return <div className={styles.transcript} id="voice-transcript" ref={lista} role="region" aria-label={soloTutor ? "Subtítulos de Bloom" : "Transcripción de la conversación"} tabIndex={0} onScroll={() => {
    const el = lista.current;
    if (el) seguir.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }}>
    <p className={styles.transcriptHeading}>{soloTutor ? "SUBTÍTULOS DE BLOOM" : "TRANSCRIPCIÓN EN VIVO"}</p>
    {!mensajes.length && <p className={styles.transcriptEmpty}>{soloTutor ? "Lo que diga Bloom aparecerá aquí." : "Lo que conversemos aparecerá aquí."}</p>}
    {mensajes.map(mensaje => <div className={styles.transcriptMessage} key={mensaje.id} data-speaker={mensaje.rol}>
      <span>{mensaje.rol === "tutor" ? "Bloom" : "Tú"}</span>
      <p>{mensaje.texto}</p>
    </div>)}
  </div>;
}

function SalaVoz({ conversacion, titulo, proveedor, automatico, terminar, reintentar }: {
  conversacion: Conversacion; titulo: string; proveedor: VozConcreta; automatico: boolean; terminar: (repasar?: boolean) => void; reintentar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const { nombre, capacidades } = datosProveedor(proveedor);
  const [verSubtitulos, setSubtitulos] = useState(false);
  const [escribir, setEscribiendo] = useState(false);
  const subtitulos = verSubtitulos && !!capacidades.subtitulos;
  const escribiendo = escribir && capacidades.escritura;
  const [texto, setTexto] = useState("");
  const [ayudas, setAyudas] = useState(false);
  const { estado, error, micSilenciado, tutorHablando, estudianteHablando, esperandoRespuesta, mensajes, inicio, fin, niveles, silenciar, enviarTexto, pulsar } = conversacion;
  const conectado = estado === "en_vivo";
  const manual = conversacion.configuracion.escucha === "pulsar";
  const fallida = estado === "error" || estado === "finalizada";
  const fase: FaseVoz = fallida ? "error" : !conectado ? "conectando" : tutorHablando ? "hablando" : estudianteHablando ? "escuchando" : esperandoRespuesta ? "pensando" : micSilenciado ? "silenciada" : "escuchando";
  const etiquetas: Record<FaseVoz, [string, string]> = {
    lista: ["Hablemos un rato", "Una conversación a tu ritmo."],
    conectando: ["Preparando tu conversación", "Permite el micrófono si tu navegador lo solicita."],
    escuchando: [estudianteHablando || conversacion.pulsando ? "Te escucho" : "Te toca a ti", manual ? "Suelta el botón cuando termines tu idea." : "Habla con naturalidad. Puedes hacer pausas."],
    hablando: ["Bloom está hablando", micSilenciado ? "Tu micrófono está silenciado." : "Puedes interrumpirme cuando quieras."],
    pensando: conversacion.apoyoActivo && capacidades.apoyo ? [`Consultando a ${capacidades.apoyo}`, "Bloom prepara una explicación más completa para ti."] : ["Un momento…", "Estoy preparando mi respuesta."],
    silenciada: [manual ? "A tu ritmo" : "Micrófono silenciado", manual ? "Mantén pulsado el micrófono para hablar." : "Actívalo cuando quieras seguir hablando."],
    error: ["Hagamos una pausa", error || "La conversación terminó. Puedes volver a conectar."],
  };

  useEffect(() => {
    const dialog = dialogo.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    const soltar = () => pulsar(false);
    const ocultar = () => { if (document.hidden) soltar(); };
    window.addEventListener("blur", soltar);
    document.addEventListener("visibilitychange", ocultar);
    return () => { window.removeEventListener("blur", soltar); document.removeEventListener("visibilitychange", ocultar); soltar(); };
  }, [pulsar]);

  function alternarTexto() {
    if (!escribiendo) {
      silenciar(true);
      setSubtitulos(true);
    }
    setEscribiendo(!escribiendo);
  }

  return <dialog ref={dialogo} className={styles.room} aria-labelledby="voice-title" onCancel={evento => { evento.preventDefault(); terminar(); }}>
    <div className={styles.roomInner} data-expanded={subtitulos || escribiendo || ayudas}>
      <header className={styles.roomHeader}>
        <div className={styles.roomBrand}><span className="brand-mark"><i/><i/><i/><i/></span><span>bloom<span className={styles.brandDot}>.</span><small>Modo de voz</small></span></div>
        {capacidades.subtitulos
          ? <button className={styles.captionButton} type="button" aria-label={subtitulos ? "Ocultar subtítulos" : "Mostrar subtítulos"} aria-pressed={subtitulos} aria-controls="voice-transcript" onClick={() => setSubtitulos(!subtitulos)}><Icon name="captions" size={23}/></button>
          : <span className={styles.voiceOnly}><Icon name="headphones" size={14}/>Solo voz</span>}
      </header>
      <div className={styles.sessionMeta}><span><Icon name="headphones" size={14}/>{titulo}</span><span className={styles.providerTag}><Icon name="sparkles" size={14}/>{nombre}{capacidades.apoyo && <small>+ {capacidades.apoyo}</small>}{automatico && <small>· elegida automáticamente</small>}</span><Duracion inicio={inicio} fin={fin}/></div>
      <div className={styles.contextBadge}>{conversacion.ayudaActiva ? "Pausa para aprender · Bloom es tu profesor" : conversacion.configuracion.modo === "simulacion" ? `Tú: ${conversacion.papelActual === "huesped" ? "huésped" : "colaborador"} · Bloom: ${conversacion.papelActual === "huesped" ? "colaborador" : "huésped"}` : NOMBRES_MODO[conversacion.configuracion.modo]}{conectado && conversacion.enfoque && ` · ${conversacion.enfoque}`}</div>
      <div className={styles.stage}>
        <Esfera fase={fase} niveles={niveles}/>
        <div className={styles.voiceStatus} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles.statusLabel}><span data-phase={fase}/>{fase === "error" ? "CONVERSACIÓN EN PAUSA" : fase === "conectando" ? "CONECTANDO" : "TÚ Y BLOOM"}</div>
          <h1 id="voice-title">{etiquetas[fase][0]}</h1>
          <p>{etiquetas[fase][1]}</p>
        </div>
        {fallida && <button className={styles.retryButton} onClick={reintentar}><Icon name="repeat" size={18}/>Volver a conectar</button>}
      </div>
      {subtitulos && <Transcripcion mensajes={mensajes} soloTutor={capacidades.subtitulos === "tutor"}/>}
      {conectado && <div className={styles.helpArea}>
        <button className={styles.helpToggle} aria-expanded={ayudas} aria-controls="voice-help" onClick={() => setAyudas(!ayudas)}><Icon name="sparkles" size={16}/>{ayudas ? "Ocultar ayuda" : "Necesito una mano"}</button>
        {ayudas && <div className={styles.helpActions} id="voice-help">
          <button onClick={() => conversacion.ayudar("mas_despacio")}>Más despacio</button>
          <button onClick={() => conversacion.ayudar("repetir")}>Repetir</button>
          <button onClick={() => conversacion.ayudar("explicar")}>Explícame</button>
          {conversacion.ayudaActiva && <button onClick={() => conversacion.ayudar("retomar")}>Retomar conversación</button>}
          {conversacion.configuracion.modo === "simulacion" && <button onClick={() => conversacion.ayudar("cambiar_papel")}>Cambiar papeles</button>}
          {conversacion.configuracion.correcciones === "a_peticion" && <button onClick={() => terminar(true)}>Terminar y repasar</button>}
        </div>}
      </div>}
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
          {capacidades.escritura && <div><button className={styles.controlButton} disabled={!conectado} onClick={alternarTexto} aria-label={escribiendo ? "Cerrar teclado" : "Escribir un mensaje"} aria-pressed={escribiendo}><Icon name="keyboard" size={23}/></button><span>Escribir</span></div>}
          <div>{manual ? <button className={`${styles.controlButton} ${styles.micButton} ${styles.holdButton}`} disabled={!conectado} aria-label="Mantener pulsado para hablar" aria-pressed={conversacion.pulsando} data-holding={conversacion.pulsando}
            onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); setEscribiendo(false); conversacion.pulsar(true); }}
            onPointerUp={() => conversacion.pulsar(false)} onPointerCancel={() => conversacion.pulsar(false)} onLostPointerCapture={() => conversacion.pulsar(false)} onBlur={() => conversacion.pulsar(false)} onContextMenu={e => e.preventDefault()}
            onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) { setEscribiendo(false); conversacion.pulsar(true); } } }}
            onKeyUp={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); conversacion.pulsar(false); } }}><Icon name="mic" size={27}/></button>
            : <button className={`${styles.controlButton} ${styles.micButton}`} data-muted={micSilenciado} disabled={!conectado} onClick={() => { silenciar(!micSilenciado); if (micSilenciado) setEscribiendo(false); }} aria-label={micSilenciado ? "Activar micrófono" : "Silenciar micrófono"} aria-pressed={micSilenciado}><Icon name={micSilenciado ? "mic-off" : "mic"} size={27}/></button>}<span>{manual ? (conversacion.pulsando ? "Hablando" : "Mantén pulsado") : micSilenciado ? "Activar" : "Silenciar"}</span></div>
          <div><button className={`${styles.controlButton} ${styles.endButton}`} onClick={() => terminar()} aria-label={estado === "conectando" ? "Cancelar conexión" : "Terminar conversación"}><Icon name="close" size={27}/></button><span>{estado === "conectando" ? "Cancelar" : "Terminar"}</span></div>
        </div>
        <p>{escribiendo ? "El micrófono está silenciado mientras escribes." : capacidades.escritura ? "Un espacio para hablar, escuchar y volver a intentar." : "Solo voz: habla con naturalidad, Bloom te escucha."}</p>
      </footer>
    </div>
  </dialog>;
}

const NIVELES_PERFIL: NivelPerfil[] = ["sin_evaluar", "A1", "A2", "B1", "B2", "C1", "C2"];
const MOTIVOS_TEMA: Record<TemaSugerido["motivo"], string> = {
  reforzar: "La última vez te costó un poco. Lo reforzamos con calma.",
  retomar: "Hace unos días que no lo practicas.",
  continuar: "Sigamos con lo que has estado practicando.",
};

export function Practice() {
  const { level, temaSugerido, temasRefuerzo } = useLearning();
  const [sugerenciaCerrada, setSugerenciaCerrada] = useState(false);
  const escenarios = useQuery(api.escenarios.listar);
  const elegirVoz = useAction(api.decisiones.elegirVoz);
  const gemini = useConversacionEnVivo();
  const openai = useConversacionOpenAI();
  const mini = useConversacionMini();
  const conversaciones: Record<VozConcreta, Conversacion> = { gemini, openai, mini };
  const { configuracion, cambiar, proveedor, cambiarProveedor } = usePreferenciasVoz();
  const [vozActiva, setVozActiva] = useState<VozConcreta>("gemini");
  const [vozAutomatica, setVozAutomatica] = useState<{ clave: string; voz: VozAutomatica } | null>(null);
  const conversacion = conversaciones[vozActiva];
  const [escenarioId, setEscenarioId] = useState("");
  const [salaAbierta, setSalaAbierta] = useState(false);
  const [resumen, setResumen] = useState<{ duracion: number; turnos: number } | null>(null);
  const [verResumen, setVerResumen] = useState(false);
  const idSeleccionado = escenarioId || escenarios?.[0]?.id || "";
  const escenario = escenarios?.find(item => item.id === idSeleccionado);
  const listo = configuracion.modo !== "simulacion" || (idSeleccionado === "personalizado" ? !!configuracion.tema.trim() : !!escenario);
  const titulo = configuracion.modo === "simulacion" ? escenario?.titulo ?? "Tu situación" : NOMBRES_MODO[configuracion.modo];
  const nivelPerfil = NIVELES_PERFIL.find(nivel => nivel === level) ?? null;
  const claveVoz = JSON.stringify([idSeleccionado, nivelPerfil, configuracion]);
  const vozElegida: VozConcreta = proveedor !== "auto" ? proveedor : vozAutomatica?.clave === claveVoz ? vozAutomatica.voz : vozPorDefecto(configuracion);

  useEffect(() => {
    if (proveedor !== "auto" || !listo) return;
    let vigente = true;
    const espera = setTimeout(() => {
      elegirVoz({ escenarioId: idSeleccionado, nivel: nivelPerfil, configuracion, fecha: fechaLocal() })
        .then(resultado => { if (vigente) setVozAutomatica({ clave: claveVoz, voz: resultado.proveedor }); })
        .catch(() => {});
    }, 600);
    return () => { vigente = false; clearTimeout(espera); };
  }, [proveedor, listo, claveVoz, idSeleccionado, nivelPerfil, configuracion, elegirVoz]);

  const mostrarSugerencia = !!temaSugerido && !temaSugerido.practicado && !sugerenciaCerrada && configuracion.tema !== temaSugerido.nombre;
  const otrosTemas = temasRefuerzo.filter(nombre => nombre !== configuracion.tema);

  function elegirTema(nombre: string) {
    cambiar(configuracion.modo === "simulacion" ? { modo: "libre", correcciones: "al_final", tema: nombre } : { tema: nombre });
    setSugerenciaCerrada(true);
  }

  function comenzar() {
    if (!listo) return;
    const destino = conversaciones[vozElegida];
    conversacion.finalizar();
    if (destino !== conversacion) destino.finalizar();
    setVozActiva(vozElegida);
    setResumen(null);
    setSalaAbierta(true);
    setVerResumen(false);
    void destino.iniciar(idSeleccionado, level, configuracion);
  }
  function terminar(repasar = false) {
    const turnos = conversacion.turnos;
    if (conversacion.inicio && turnos) {
      setResumen({ duracion: segundosTranscurridos(conversacion.inicio, conversacion.fin), turnos });
    }
    conversacion.cerrarConResumen(repasar);
    setSalaAbierta(false);
  }

  return <div className={styles.practice}>
    {resumen ? <section className={styles.summary}>
      <div className={styles.summaryIcon}><Icon name="check" size={30}/></div>
      <p className={styles.eyebrow}>UN POCO MÁS DE CONFIANZA</p>
      <h1>Hoy te animaste<br/>a hablar.</h1>
      <p>Cada conversación cuenta. Sigue a tu ritmo.</p>
      <div className={styles.summaryStats}><div><strong>{formatoDuracion(resumen.duracion)}</strong><span>conversando</span></div><div><strong>{resumen.turnos}</strong><span>{resumen.turnos === 1 ? "intervención tuya" : "intervenciones tuyas"}</span></div></div>
      {conversacion.estadoResumen === "preparando" && <p role="status">Preparando tu repaso… El micrófono ya está apagado.</p>}
      {conversacion.estadoResumen === "no_disponible" && <p role="status">{conversacion.mensajes.length ? "No se pudo preparar el repaso. Tu conversación sigue disponible abajo." : "No se pudo preparar el repaso esta vez."}</p>}
      {conversacion.resumen && <div className={styles.review}>
        <article><span>LO QUE LOGRASTE</span><p>{conversacion.resumen.logro.detalle}</p><blockquote>{conversacion.resumen.logro.evidencia}</blockquote></article>
        {conversacion.resumen.correcciones.map((c, i) => <article key={i}><span>PARA SEGUIR MEJORANDO</span><p className={styles.original}>{c.original}</p><p lang="en" className={styles.improvement}>{c.mejora}</p><p>{c.explicacion}</p></article>)}
        <article><span>UNA FRASE PARA LLEVARTE</span><p lang="en" className={styles.improvement}>{conversacion.resumen.frase}</p></article>
      </div>}
      <button className={styles.startButton} onClick={comenzar}><Icon name="mic" size={20}/>Volver a conversar</button>
      <button className={styles.secondaryButton} onClick={() => { conversacion.finalizar(); setResumen(null); }}>Cambiar mi práctica<Icon name="arrow" size={17}/></button>
      {conversacion.mensajes.length > 0 && <>
        <button className={styles.transcriptToggle} aria-expanded={verResumen} onClick={() => setVerResumen(!verResumen)}><Icon name="captions" size={18}/>{verResumen ? "Ocultar conversación" : "Ver conversación"}</button>
        {verResumen && <Transcripcion mensajes={conversacion.mensajes} soloTutor={datosProveedor(vozActiva).capacidades.subtitulos === "tutor"}/>}
      </>}
    </section> : <>
      <section className={styles.heading}>
        <p className={styles.eyebrow}>CONVERSA CON BLOOM</p>
        <h1>Hoy, a <em>tu manera.</em></h1>
        <p>Una charla, una explicación o una situación real.</p>
      </section>
      <div className={styles.preview}><Esfera fase="lista"/><span className={styles.voiceBadge}><span/>Voz en tiempo real</span></div>
      {mostrarSugerencia && temaSugerido && <section className={styles.suggestion} aria-label="Sugerencia de Bloom">
        <p className={styles.eyebrow}>BLOOM TE PROPONE</p>
        <h2>¿Quieres que hablemos de {enFrase(temaSugerido.nombre)} hoy?</h2>
        <p>{MOTIVOS_TEMA[temaSugerido.motivo]}</p>
        {temaSugerido.palabras.length > 0 && <div className={styles.suggestionWords} aria-label="Palabras para reforzar">{temaSugerido.palabras.slice(0, 5).map(palabra => <span key={palabra} lang="en">{palabra}</span>)}</div>}
        <div className={styles.suggestionActions}>
          <button onClick={() => elegirTema(temaSugerido.nombre)}>Sí, hablemos de esto</button>
          <button onClick={() => setSugerenciaCerrada(true)}>Otro día</button>
        </div>
      </section>}
      {otrosTemas.length > 0 && <div className={styles.reinforce}>
        <p>REFORZAR UN TEMA</p>
        <div>{otrosTemas.map(nombre => <button key={nombre} onClick={() => elegirTema(nombre)}>{nombre}</button>)}</div>
      </div>}
      <PracticeSettings configuracion={configuracion} cambiar={cambiar} proveedor={proveedor} cambiarProveedor={cambiarProveedor} vozAutomatica={listo ? vozElegida : null} escenarios={escenarios} escenarioId={idSeleccionado} elegirEscenario={setEscenarioId}/>
      <button className={styles.startButton} disabled={!listo} onClick={comenzar}><Icon name="mic" size={21}/>Empezar a hablar<Icon name="arrow" size={19}/></button>
      <p className={styles.startNote}>{configuracion.escucha === "pulsar" ? "Tú decides cuándo se abre el micrófono." : "Activa el micrófono una vez. Después, solo conversa."}</p>
      <div className={styles.features}><span><Icon name="headphones" size={16}/>A tu ritmo</span><span className={styles.featureDot}/><span><Icon name="sparkles" size={16}/>Sin presión</span></div>
    </>}
    {salaAbierta && <SalaVoz conversacion={conversacion} titulo={titulo} proveedor={vozActiva} automatico={proveedor === "auto"} terminar={terminar} reintentar={comenzar}/>}
  </div>;
}
