import type { LiveCallbacks, LiveServerMessage, Session } from "@google/genai";
import { CONFIGURACION_INICIAL, MINUTOS_SESION_VOZ, type ConfiguracionPractica, type AccionAyuda, type PapelEstudiante, type ResumenPractica } from "../../lib/practice-config";
import { validarResumen } from "../../lib/practice-review";
import {
  contextoDecision, dificultadesSesion, ESTADO_PEDAGOGICO_INICIAL, etiquetaNivel, notasSesion, planificarGuia,
  type DecisionTurno, type EntradaDecision, type EstadoPedagogico, type NivelPerfil, type SolicitudDecision,
} from "../../lib/practice-decisions";
import { fechaLocal, type RegistroSesion } from "../../lib/learning-memory";
import { hayUso, sumarUso, usoGemini, USO_VACIO, type ConceptoGasto, type ConsumoSesion, type ProveedorGasto, type SesionGasto, type Uso } from "../../lib/api-costs";

export type EstadoConversacion = "inactivo" | "conectando" | "en_vivo" | "finalizada" | "error";
export type MensajeConversacion = { id: number; rol: "estudiante" | "tutor"; texto: string };
type Nivel = NivelPerfil;
type DatosSesion = { token: string; modelo: string; instruccion: string; voz: string; sesionJson?: string };
type RecursosTransporte = { flujo: MediaStream | null; salida: (flujoRemoto: MediaStream) => void; actividad?: () => { clara: number; total: number } };
type Dependencias = {
  crearToken: (args: { escenarioId: string; nivel: Nivel | null; configuracion: ConfiguracionPractica }) => Promise<DatosSesion>;
  conectar: (datos: DatosSesion, callbacks: LiveCallbacks, configuracion: ConfiguracionPractica, transporte?: RecursosTransporte) => Promise<Session>;
  transcripcion?: Record<MensajeConversacion["rol"], boolean>;
  decidir?: (args: SolicitudDecision) => Promise<DecisionTurno | null>;
  registrar?: (registro: RegistroSesion) => void;
  gasto?: { proveedor: ProveedorGasto; registrar: (sesion: SesionGasto) => void };
};
type SesionExtendida = Session & {
  agregarInstruccion?: (texto: string) => void;
  agregarMensajeUsuario?: (texto: string) => void;
  agregarContexto?: (texto: string) => void;
  silenciarEntrada?: (silenciado: boolean) => void;
  solicitarResumen?: (texto: string) => void;
};
type TextoInterno = { rol: MensajeConversacion["rol"]; texto: string; item?: string; final?: boolean; nuevoTurno?: boolean };
type MensajeExtra = LiveServerMessage & { vozRemota?: { hablando: boolean }; turnoEstudiante?: boolean; apoyo?: boolean; textoInterno?: TextoInterno; consumo?: { concepto: ConceptoGasto; modelo: string; uso: Uso } };
type EntradaHistorial = EntradaDecision & { id: number };
type OrigenHistorial = { mensaje?: number; item?: string; final?: boolean; nuevoTurno?: boolean };
type Decisiones = {
  activas: boolean;
  enCurso: boolean;
  pendiente: boolean;
  firma: string;
  fallos: number;
  temporizador?: ReturnType<typeof setTimeout>;
  estado: EstadoPedagogico;
  guiaPendiente: string;
};
type Snapshot = {
  estado: EstadoConversacion;
  mensajes: MensajeConversacion[];
  error: string;
  micSilenciado: boolean;
  tutorHablando: boolean;
  estudianteHablando: boolean;
  esperandoRespuesta: boolean;
  inicio: number | null;
  fin: number | null;
  configuracion: ConfiguracionPractica;
  papelActual: PapelEstudiante;
  ayudaActiva: boolean;
  pulsando: boolean;
  resumen: ResumenPractica | null;
  estadoResumen: "inactivo" | "preparando" | "listo" | "no_disponible";
  turnos: number;
  apoyoActivo: boolean;
  enfoque: string | null;
};
type Recursos = {
  sesion: Session | null;
  contexto: AudioContext | null;
  reproduccion: AudioContext | null;
  flujo: MediaStream | null;
  captura: AudioWorkletNode | null;
  analizador: AnalyserNode | null;
  fuentes: Set<AudioBufferSourceNode>;
  proximoInicio: number;
  timeout?: ReturnType<typeof setTimeout>;
  medidor?: ReturnType<typeof setInterval>;
  ultimaVoz: number;
  transcripciones: Partial<Record<MensajeConversacion["rol"], number>>;
  pulsacion: boolean;
  soltando: boolean;
  cierrePulsacion?: ReturnType<typeof setTimeout>;
  cerrando: boolean;
  audioRemoto: HTMLAudioElement | null;
  remotoHablando: boolean;
  remotoSonando: boolean;
  ultimaSalida: number;
  vozClaraMs: number;
  vozTotalMs: number;
  escenarioId: string;
  nivel: Nivel | null;
  sesionId: string;
  fecha: string;
  modelo: string;
  conectadaEn: number | null;
  usos: Map<string, ConsumoSesion>;
  historial: EntradaHistorial[];
  historialMensajes: Map<number, EntradaHistorial>;
  historialItems: Map<string, EntradaHistorial>;
  decisiones: Decisiones;
};

const INICIAL: Snapshot = {
  estado: "inactivo", mensajes: [], error: "", micSilenciado: false,
  tutorHablando: false, estudianteHablando: false, esperandoRespuesta: false, inicio: null, fin: null,
  configuracion: CONFIGURACION_INICIAL, papelActual: "colaborador", ayudaActiva: false, pulsando: false,
  resumen: null, estadoResumen: "inactivo", turnos: 0, apoyoActivo: false, enfoque: null,
};

const ESPERA_DECISION_MS = 700;
const MAX_HISTORIAL = 120;
const MAX_ENTRADAS_DECISION = 10;
const MAX_TEXTO_DECISION = 500;
const MAX_FALLOS_DECISION = 3;
const UMBRAL_VOZ_SUAVE = 0.012;
const UMBRAL_VOZ_CLARA = 0.04;

function contarPalabras(texto: string) {
  return texto.split(/\s+/).filter(Boolean).length;
}

// About 64ms per packet at 16kHz; output stays silent to avoid microphone feedback.
const WORKLET = `
class CapturaPcm extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(1024); this.offset = 0;
    this.port.onmessage = () => {
      if (this.offset) { const tail = this.buffer.slice(0, this.offset); this.port.postMessage(tail, [tail.buffer]); this.offset = 0; }
      this.port.postMessage("flushed");
    };
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) for (const value of channel) {
      this.buffer[this.offset++] = value;
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(1024);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("captura-pcm", CapturaPcm);`;

export function codificarPcm(muestras: Float32Array): string {
  const bytes = new Uint8Array(muestras.length * 2);
  const vista = new DataView(bytes.buffer);
  muestras.forEach((muestra, indice) => {
    const valor = Math.max(-1, Math.min(1, muestra));
    vista.setInt16(indice * 2, valor * (valor < 0 ? 32768 : 32767), true);
  });
  return btoa(String.fromCharCode(...bytes));
}

function decodificarPcm(base64: string): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const vista = new DataView(bytes.buffer);
  return Float32Array.from({ length: Math.floor(bytes.length / 2) }, (_, i) => vista.getInt16(i * 2, true) / 32768);
}

function errorMicrofono(error: unknown): string {
  const nombre = error instanceof Error ? error.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "Permite el micrófono en los ajustes de este sitio y vuelve a intentarlo.";
  }
  if (nombre === "NotFoundError") return "No encontramos un micrófono. Conecta uno y vuelve a intentarlo.";
  if (nombre === "NotReadableError") return "Otra aplicación está usando el micrófono. Ciérrala y vuelve a intentarlo.";
  return "No pudimos activar el audio. Revisa tu micrófono y vuelve a intentarlo.";
}

export class ConversacionLive {
  private snapshot: Snapshot = INICIAL;
  private listeners = new Set<() => void>();
  private actual: Recursos | null = null;
  private siguienteId = 0;
  private siguienteEntrada = 0;
  readonly niveles = { entrada: 0, salida: 0 };

  constructor(private dependencias: Dependencias) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private actualizar(cambios: Partial<Snapshot>) {
    const tutorHablaba = this.snapshot.tutorHablando;
    this.snapshot = { ...this.snapshot, ...cambios };
    if (tutorHablaba !== this.snapshot.tutorHablando) this.cambioVozTutor(this.snapshot.tutorHablando);
    this.listeners.forEach((listener) => listener());
  }

  private instruir(r: Recursos, sesion: Session, texto: string) {
    const guia = r.decisiones.guiaPendiente;
    r.decisiones.guiaPendiente = "";
    const completo = guia ? `${texto}\n${guia}` : texto;
    const extendida = sesion as SesionExtendida;
    if (extendida.agregarInstruccion) {
      extendida.agregarInstruccion(completo);
      return;
    }
    sesion.sendClientContent({ turns: [{ role: "user", parts: [{ text: completo }] }], turnComplete: true });
  }

  private registrarHistorial(r: Recursos, rol: MensajeConversacion["rol"], texto: string, origen: OrigenHistorial = {}) {
    let entrada = origen.mensaje !== undefined ? r.historialMensajes.get(origen.mensaje)
      : origen.item ? r.historialItems.get(origen.item)
        : undefined;
    if (!entrada && origen.mensaje === undefined && !origen.item && !origen.nuevoTurno) {
      const ultima = r.historial.at(-1);
      if (ultima?.rol === rol) entrada = ultima;
    }
    if (!entrada) {
      entrada = { id: ++this.siguienteEntrada, rol, texto: "" };
      r.historial.push(entrada);
      if (origen.mensaje !== undefined) r.historialMensajes.set(origen.mensaje, entrada);
      if (origen.item) r.historialItems.set(origen.item, entrada);
      if (r.historial.length > MAX_HISTORIAL) r.historial.splice(0, r.historial.length - MAX_HISTORIAL);
    }
    entrada.texto = origen.final ? texto : entrada.texto + texto;
  }

  private cambioVozTutor(hablando: boolean) {
    const r = this.actual;
    if (!r) return;
    clearTimeout(r.decisiones.temporizador);
    if (!hablando && !r.cerrando) r.decisiones.temporizador = setTimeout(() => void this.decidir(r), ESPERA_DECISION_MS);
  }

  private async decidir(r: Recursos) {
    const decidir = this.dependencias.decidir;
    const d = r.decisiones;
    if (!decidir || !d.activas || this.actual !== r || r.cerrando || !r.sesion || this.snapshot.estado !== "en_vivo") return;
    if (d.enCurso) { d.pendiente = true; return; }
    const alumno = r.historial.findLast((entrada) => entrada.rol === "estudiante" && entrada.texto.trim());
    if (!alumno) return;
    const firma = `${alumno.id}:${alumno.texto.length}`;
    if (firma === d.firma) return;
    d.firma = firma;
    d.enCurso = true;
    const tutorRespondio = r.historial.slice(r.historial.indexOf(alumno) + 1).some((entrada) => entrada.rol === "tutor" && entrada.texto.trim());
    const historial = r.historial
      .filter((entrada) => entrada.texto.trim())
      .slice(-MAX_ENTRADAS_DECISION)
      .map(({ rol, texto }) => ({ rol, texto: texto.trim().slice(-MAX_TEXTO_DECISION) }));
    try {
      const decision = await decidir({
        sesionId: r.sesionId,
        fecha: r.fecha,
        escenarioId: r.escenarioId,
        configuracion: this.snapshot.configuracion,
        historial,
        contexto: contextoDecision(d.estado, this.snapshot.ayudaActiva, this.snapshot.papelActual),
      });
      d.fallos = decision ? 0 : d.fallos + 1;
      if (decision && this.actual === r && !r.cerrando) this.aplicarDecision(r, decision, alumno, tutorRespondio, historial);
    } catch {
      d.fallos += 1;
    } finally {
      d.enCurso = false;
      if (d.fallos >= MAX_FALLOS_DECISION) d.activas = false;
      if (d.pendiente && this.actual === r) {
        d.pendiente = false;
        void this.decidir(r);
      }
    }
  }

  private aplicarDecision(r: Recursos, decision: DecisionTurno, alumno: EntradaHistorial, tutorRespondio: boolean, historial: EntradaDecision[]) {
    const recientes = (rol: MensajeConversacion["rol"]) => historial.filter((entrada) => entrada.rol === rol).slice(-3).reduce((suma, entrada) => suma + contarPalabras(entrada.texto), 0);
    const plan = planificarGuia(decision, r.decisiones.estado, {
      configuracion: this.snapshot.configuracion,
      ayudaActiva: this.snapshot.ayudaActiva,
      tutorRespondio,
      palabrasUltimoTurno: contarPalabras(alumno.texto),
      palabrasEstudiante: recientes("estudiante"),
      palabrasTutor: recientes("tutor"),
    });
    r.decisiones.estado = plan.estado;
    const sesion = r.sesion;
    if (!sesion) return;
    const vigente = r.historial.findLast((entrada) => entrada.rol === "estudiante" && entrada.texto.trim()) === alumno;
    const vista = this.snapshot;
    const libre = !vista.tutorHablando && !vista.estudianteHablando && !vista.pulsando && !vista.esperandoRespuesta && !vista.apoyoActivo;
    try {
      if (plan.guia) {
        const extendida = sesion as SesionExtendida;
        if (extendida.agregarContexto) extendida.agregarContexto(plan.guia);
        else r.decisiones.guiaPendiente = plan.guia;
      }
      if (plan.intervencion && vigente && libre) {
        this.instruir(r, sesion, plan.intervencion);
        this.actualizar({ esperandoRespuesta: true });
      }
    } catch {
      return;
    }
    const cambios: Partial<Snapshot> = {};
    if (plan.enfoque !== this.snapshot.enfoque) cambios.enfoque = plan.enfoque;
    if (plan.ayudaActiva !== undefined && plan.ayudaActiva !== this.snapshot.ayudaActiva) cambios.ayudaActiva = plan.ayudaActiva;
    if (Object.keys(cambios).length) this.actualizar(cambios);
  }

  private enviarAlBackend(sesion: Session, texto: string) {
    const extendida = sesion as SesionExtendida;
    if (extendida.agregarMensajeUsuario) {
      extendida.agregarMensajeUsuario(texto);
      return;
    }
    sesion.sendClientContent({ turns: [{ role: "user", parts: [{ text: texto }] }], turnComplete: true });
  }

  private pedirResumen(sesion: Session, texto: string) {
    const extendida = sesion as SesionExtendida;
    if (extendida.solicitarResumen) extendida.solicitarResumen(texto);
    else this.enviarAlBackend(sesion, texto);
  }

  private transcribe(rol: MensajeConversacion["rol"]) {
    return this.dependencias.transcripcion?.[rol] ?? true;
  }

  private vozRemota(r: Recursos, cambios: { hablando?: boolean; sonando?: boolean }) {
    if (cambios.hablando !== undefined) r.remotoHablando = cambios.hablando;
    if (cambios.sonando !== undefined) r.remotoSonando = cambios.sonando;
    if (r.cerrando) return;
    const hablando = r.remotoHablando || r.remotoSonando;
    if (hablando === this.snapshot.tutorHablando) return;
    this.actualizar(hablando ? { tutorHablando: true, esperandoRespuesta: false } : { tutorHablando: false });
  }

  private pararReproduccion(r: Recursos) {
    for (const fuente of r.fuentes) {
      fuente.onended = null;
      try { fuente.stop(); } catch { /* A source may already have ended. */ }
      fuente.disconnect();
    }
    r.fuentes.clear();
    r.proximoInicio = r.reproduccion?.currentTime ?? 0;
    this.niveles.salida = 0;
  }

  private liberar() {
    const r = this.actual;
    // Invalidate first: late permission, token, WebSocket and audio callbacks are ignored.
    this.actual = null;
    if (!r) return;
    this.registrarSesion(r);
    this.registrarGasto(r);
    clearTimeout(r.timeout);
    clearTimeout(r.cierrePulsacion);
    clearTimeout(r.decisiones.temporizador);
    clearInterval(r.medidor);
    this.pararReproduccion(r);
    if (r.captura) {
      r.captura.port.onmessage = null;
      r.captura.disconnect();
      r.captura.port.close();
    }
    r.flujo?.getTracks().forEach((pista) => { pista.onended = null; pista.stop(); });
    if (r.audioRemoto) {
      r.audioRemoto.pause();
      r.audioRemoto.srcObject = null;
    }
    r.analizador?.disconnect();
    if (r.contexto && r.contexto.state !== "closed") void r.contexto.close().catch(() => {});
    if (r.reproduccion && r.reproduccion.state !== "closed") void r.reproduccion.close().catch(() => {});
    try { r.sesion?.close(); } catch { /* The transport may already be closed. */ }
    this.niveles.entrada = this.niveles.salida = 0;
  }

  private acumularUso(r: Recursos, concepto: ConceptoGasto, modelo: string, uso: Uso) {
    if (!hayUso(uso)) return;
    const clave = `${concepto}|${modelo}`;
    const actual = r.usos.get(clave);
    r.usos.set(clave, actual ? { ...actual, uso: sumarUso(actual.uso, uso), llamadas: actual.llamadas + 1 } : { concepto, modelo, uso, llamadas: 1 });
  }

  private registrarGasto(r: Recursos) {
    const gasto = this.dependencias.gasto;
    if (!gasto || (r.conectadaEn === null && !r.usos.size)) return;
    const duracionSegundos = r.conectadaEn === null ? 0 : (Date.now() - r.conectadaEn) / 1000;
    if (gasto.proveedor === "openai") this.acumularUso(r, "voz", r.modelo, { ...USO_VACIO, segundos: duracionSegundos });
    try {
      gasto.registrar({
        sesionId: r.sesionId,
        fecha: r.fecha,
        proveedor: gasto.proveedor,
        modelo: r.modelo,
        modo: this.snapshot.configuracion.modo,
        tema: this.snapshot.configuracion.tema,
        inicio: r.conectadaEn ?? Date.now(),
        duracionSegundos,
        turnos: this.snapshot.turnos,
        consumos: [...r.usos.values()],
      });
    } catch {
      return;
    }
  }

  private registrarSesion(r: Recursos) {
    const registrar = this.dependencias.registrar;
    const historial = r.historial.map(({ rol, texto }) => ({ rol, texto: texto.trim() })).filter((entrada) => entrada.texto);
    if (!registrar || !historial.some((entrada) => entrada.rol === "estudiante")) return;
    try {
      registrar({
        sesionId: r.sesionId,
        fecha: r.fecha,
        escenarioId: r.escenarioId,
        configuracion: this.snapshot.configuracion,
        historial,
        dificultades: dificultadesSesion(r.decisiones.estado),
        nivel: etiquetaNivel(r.decisiones.estado) ?? r.nivel,
      });
    } catch {
      return;
    }
  }

  private fallar(r: Recursos, error: string) {
    if (this.actual !== r) return;
    if (r.cerrando) { this.finalizar(); this.actualizar({ estadoResumen: "no_disponible" }); return; }
    this.liberar();
    this.actualizar({ estado: "error", error, fin: Date.now(), tutorHablando: false, estudianteHablando: false, esperandoRespuesta: false, apoyoActivo: false });
  }

  finalizar = () => {
    this.liberar();
    this.actualizar({ estado: "finalizada", fin: this.snapshot.fin ?? Date.now(), tutorHablando: false, estudianteHablando: false, esperandoRespuesta: false, pulsando: false, apoyoActivo: false });
  };

  cerrarConResumen = (solicitado = false) => {
    const r = this.actual;
    if (r?.cerrando) return;
    const intervenciones = this.snapshot.mensajes.filter(m => m.rol === "estudiante");
    if (!r?.sesion || this.snapshot.estado !== "en_vivo" || !this.snapshot.turnos || (this.snapshot.configuracion.correcciones === "a_peticion" && !solicitado)) { this.finalizar(); return; }
    r.cerrando = true;
    clearTimeout(r.cierrePulsacion);
    this.pararReproduccion(r);
    if (r.audioRemoto) r.audioRemoto.muted = true;
    r.flujo?.getTracks().forEach(p => { p.onended = null; p.stop(); });
    this.niveles.entrada = 0;
    this.actualizar({ estado: "finalizada", fin: Date.now(), micSilenciado: true, pulsando: false, estudianteHablando: false, tutorHablando: false, esperandoRespuesta: false, apoyoActivo: false, estadoResumen: "preparando" });
    r.timeout = setTimeout(() => { if (this.actual === r) { this.finalizar(); this.actualizar({ estadoResumen: "no_disponible" }); } }, 15000);
    const evidencia = this.transcribe("estudiante")
      ? `Use ONLY these learner transcripts as evidence: ${JSON.stringify(intervenciones.map(m => m.texto))}`
      : "Use ONLY the learner's own words from this conversation as evidence, quoted exactly as they said them.";
    const notas = notasSesion(r.decisiones.estado);
    try {
      if (this.snapshot.configuracion.escucha !== "pulsar") r.sesion.sendRealtimeInput({ audioStreamEnd: true });
      else if (r.pulsacion) r.sesion.sendRealtimeInput({ activityEnd: {} });
      this.pedirResumen(r.sesion, `The application has ended the practice. Do not speak. First call guardar_progreso if that tool is available (quote only verbatim learner words; empty arrays are valid). Then call entregar_resumen now if it is available. Explain in ${this.snapshot.configuracion.idiomaAyuda === "espanol" ? "Spanish" : "English"}. Include one demonstrated achievement with a verbatim learner quote, zero to two useful corrections with verbatim learner quotes, and one English phrase to practice. Never invent evidence or pronunciation feedback. ${evidencia}${notas ? ` ${notas}` : ""}`);
    } catch { this.fallar(r, ""); }
  };

  ayudar = (accion: AccionAyuda) => {
    const r = this.actual;
    if (!r?.sesion || this.snapshot.estado !== "en_vivo") return;
    this.pulsar(false);
    const papel = this.snapshot.papelActual === "huesped" ? "colaborador" : "huesped";
    const instrucciones: Record<AccionAyuda, string> = {
      mas_despacio: "Speak more slowly from now on, with natural pauses. Briefly repeat your last message.",
      repetir: "Repeat your last message, without introducing a new question.",
      explicar: `Pause the scene and act as my teacher. Explain the last exchange in ${this.snapshot.configuracion.idiomaAyuda === "espanol" ? "Spanish" : "English"}, with an example. Keep the scene available to resume.`,
      retomar: "Resume the previous conversation/scene, with the same roles and context. Stop the temporary teacher explanation.",
      cambiar_papel: `Swap roles now. The LEARNER is now ${papel === "huesped" ? "the guest" : "the staff member"}; YOU are the opposite role. Continue the same scene.`,
    };
    if (accion === "cambiar_papel" && this.snapshot.configuracion.modo !== "simulacion") return;
    this.pararReproduccion(r);
    try {
      this.instruir(r, r.sesion, instrucciones[accion]);
      this.actualizar({ tutorHablando: false, esperandoRespuesta: true,
        ...(accion === "explicar" || accion === "retomar" ? { ayudaActiva: accion === "explicar" } : {}),
        ...(accion === "cambiar_papel" ? { papelActual: papel, ayudaActiva: false } : {}),
      });
    } catch { this.fallar(r, "No pudimos enviar la solicitud. Vuelve a conectar."); }
  };

  private terminarPulsacion(r: Recursos) {
    if (this.actual !== r || !r.pulsacion || r.cerrando) return;
    clearTimeout(r.cierrePulsacion);
    r.pulsacion = r.soltando = false;
    try { r.sesion?.sendRealtimeInput({ activityEnd: {} }); }
    catch { this.fallar(r, "Se perdió la conexión. Vuelve a conectar."); }
  }

  pulsar = (pulsando: boolean) => {
    const r = this.actual;
    if (!r?.sesion || this.snapshot.estado !== "en_vivo" || this.snapshot.configuracion.escucha !== "pulsar") return;
    if (pulsando) {
      if (r.pulsacion) return;
      try { r.sesion.sendRealtimeInput({ activityStart: {} }); }
      catch { this.fallar(r, "Se perdió la conexión. Vuelve a conectar."); return; }
      r.pulsacion = true;
      this.pararReproduccion(r);
      r.flujo?.getAudioTracks().forEach(p => { p.enabled = true; });
      this.actualizar({ pulsando: true, micSilenciado: false, tutorHablando: false, esperandoRespuesta: false });
    } else if (r.pulsacion && !r.soltando) {
      r.soltando = true;
      r.flujo?.getAudioTracks().forEach(p => { p.enabled = false; });
      this.niveles.entrada = 0;
      this.actualizar({ pulsando: false, micSilenciado: true, estudianteHablando: false, esperandoRespuesta: true });
      // Flush the final partial packet before activityEnd; fall back if the audio thread is suspended.
      r.cierrePulsacion = setTimeout(() => this.terminarPulsacion(r), 250);
      r.captura?.port.postMessage("flush");
    }
  };

  private transcribir(r: Recursos, rol: MensajeConversacion["rol"], texto?: string, final = false, visible = this.transcribe(rol)) {
    if (texto) {
      const id = r.transcripciones[rol];
      const anterior = id === undefined ? undefined : this.snapshot.mensajes.find((mensaje) => mensaje.id === id);
      if (anterior) {
        this.registrarHistorial(r, rol, texto, { mensaje: anterior.id });
        this.actualizar({ mensajes: this.snapshot.mensajes.map((mensaje) => mensaje.id === id ? { ...mensaje, texto: mensaje.texto + texto } : mensaje) });
      } else if (id === undefined) {
        const nuevo = { id: ++this.siguienteId, rol, texto };
        r.transcripciones[rol] = nuevo.id;
        if (visible) this.registrarHistorial(r, rol, texto, { mensaje: nuevo.id });
        this.actualizar({
          ...(visible ? { mensajes: [...this.snapshot.mensajes, nuevo] } : {}),
          ...(rol === "estudiante" ? { turnos: this.snapshot.turnos + 1 } : {}),
        });
      }
    }
    if (final) delete r.transcripciones[rol];
  }

  private reproducir(r: Recursos, base64: string, mimeType?: string) {
    const contexto = r.reproduccion;
    if (!contexto) return;
    const muestras = decodificarPcm(base64);
    if (!muestras.length) return;
    const frecuencia = Number(mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
    const buffer = contexto.createBuffer(1, muestras.length, frecuencia);
    buffer.getChannelData(0).set(muestras);
    const fuente = contexto.createBufferSource();
    fuente.buffer = buffer;
    fuente.connect(r.analizador!);
    const inicio = Math.max(contexto.currentTime + 0.02, r.proximoInicio);
    r.proximoInicio = inicio + buffer.duration;
    r.fuentes.add(fuente);
    fuente.onended = () => {
      fuente.disconnect();
      r.fuentes.delete(fuente);
      if (this.actual === r && !r.fuentes.size) {
        this.niveles.salida = 0;
        this.actualizar({ tutorHablando: false });
      }
    };
    fuente.start(inicio);
    this.actualizar({ tutorHablando: true, esperandoRespuesta: false });
  }

  private recibir(r: Recursos, mensaje: LiveServerMessage) {
    if (this.actual !== r) return;
    const extra = mensaje as MensajeExtra;
    if (extra.consumo) {
      this.acumularUso(r, extra.consumo.concepto, extra.consumo.modelo, extra.consumo.uso);
      return;
    }
    if (mensaje.usageMetadata) this.acumularUso(r, "voz", r.modelo, usoGemini(mensaje.usageMetadata));
    if (extra.vozRemota) {
      this.vozRemota(r, { hablando: extra.vozRemota.hablando });
      return;
    }
    if (extra.turnoEstudiante) {
      if (!r.cerrando) this.actualizar({ turnos: this.snapshot.turnos + 1 });
      return;
    }
    if (typeof extra.apoyo === "boolean") {
      if (!r.cerrando) this.actualizar(extra.apoyo ? { apoyoActivo: true, esperandoRespuesta: !this.snapshot.tutorHablando } : { apoyoActivo: false });
      return;
    }
    if (extra.textoInterno) {
      if (r.cerrando) return;
      const { rol, texto, item, final } = extra.textoInterno;
      this.registrarHistorial(r, rol, texto, extra.textoInterno);
      const entrada = item ? r.historialItems.get(item) : undefined;
      const respondida = !!entrada && r.historial.slice(r.historial.indexOf(entrada) + 1).some((siguiente) => siguiente.rol === "tutor" && siguiente.texto.trim());
      if (final && respondida && !this.snapshot.tutorHablando) this.cambioVozTutor(false);
      return;
    }
    for (const llamada of mensaje.toolCall?.functionCalls ?? []) {
      let respuesta: Record<string, unknown> = { error: "Unsupported request" };
      if (llamada.name === "entregar_resumen" && r.cerrando) {
        const resumen = validarResumen(llamada.args, this.transcribe("estudiante") ? this.snapshot.mensajes.filter(m => m.rol === "estudiante").map(m => m.texto) : null);
        if (resumen) {
          r.sesion?.sendToolResponse({ functionResponses: [{ id: llamada.id, name: llamada.name, response: { ok: true } }] });
          this.finalizar(); this.actualizar({ resumen, estadoResumen: "listo" }); return;
        }
        respuesta = { error: "Use verbatim learner quotes from the supplied transcript. Retry with valid evidence." };
      } else if (llamada.name === "actualizar_contexto" && !r.cerrando) {
        const { ayudaActiva, papelEstudiante } = llamada.args ?? {};
        if (typeof ayudaActiva === "boolean" && (papelEstudiante === "huesped" || papelEstudiante === "colaborador")) {
          this.actualizar({ ayudaActiva, ...(this.snapshot.configuracion.modo === "simulacion" ? { papelActual: papelEstudiante } : {}) });
          respuesta = { ok: true, papelEstudiante: this.snapshot.papelActual, ayudaActiva };
        }
      }
      r.sesion?.sendToolResponse({ functionResponses: [{ id: llamada.id, name: llamada.name, response: respuesta }] });
    }
    if (r.cerrando) return;
    const contenido = mensaje.serverContent;
    if (!contenido) return;
    if (contenido.interrupted) {
      this.pararReproduccion(r);
      delete r.transcripciones.tutor;
      this.actualizar({ tutorHablando: false, esperandoRespuesta: false });
    }
    this.transcribir(r, "estudiante", contenido.inputTranscription?.text, contenido.inputTranscription?.finished);
    this.transcribir(r, "tutor", contenido.outputTranscription?.text, contenido.outputTranscription?.finished);
    for (const parte of contenido.modelTurn?.parts ?? []) {
      if (parte.inlineData?.data && parte.inlineData.mimeType?.startsWith("audio/pcm")) {
        this.reproducir(r, parte.inlineData.data, parte.inlineData.mimeType);
      }
    }
    if (contenido.turnComplete) {
      r.transcripciones = {};
      // Generation completion can arrive before queued audio finishes playing.
      this.actualizar({ esperandoRespuesta: false });
    }
    if (contenido.waitingForInput) this.actualizar({ esperandoRespuesta: false });
  }

  private capturar(r: Recursos, muestras: Float32Array) {
    if (this.actual !== r || !r.sesion || r.cerrando || (this.snapshot.configuracion.escucha === "pulsar" ? !r.pulsacion : this.snapshot.micSilenciado)) return;
    let energia = 0;
    for (const muestra of muestras) energia += muestra * muestra;
    const rms = Math.sqrt(energia / muestras.length);
    const duracion = (muestras.length / r.contexto!.sampleRate) * 1000;
    if (rms > UMBRAL_VOZ_SUAVE) r.vozTotalMs += duracion;
    if (rms > UMBRAL_VOZ_CLARA) r.vozClaraMs += duracion;
    this.niveles.entrada = r.soltando ? 0 : Math.min(1, rms * 9);
    if (rms > 0.025) r.ultimaVoz = performance.now();
    const hablando = !r.soltando && performance.now() - r.ultimaVoz < 800;
    if (hablando !== this.snapshot.estudianteHablando) {
      this.actualizar({ estudianteHablando: hablando, esperandoRespuesta: !hablando && !this.snapshot.tutorHablando });
    }
    try {
      r.sesion.sendRealtimeInput({ audio: { data: codificarPcm(muestras), mimeType: `audio/pcm;rate=${r.contexto!.sampleRate}` } });
    } catch {
      this.fallar(r, "Se perdió la conexión. Vuelve a conectar para seguir conversando.");
    }
  }

  silenciar = (silenciado: boolean) => {
    const r = this.actual;
    if (this.snapshot.configuracion.escucha === "pulsar") { if (silenciado) this.pulsar(false); return; }
    if (!r?.sesion || this.snapshot.estado !== "en_vivo" || silenciado === this.snapshot.micSilenciado) return;
    // Disable the track as well as upload: switching to text must really mute capture.
    r.flujo?.getAudioTracks().forEach((pista) => { pista.enabled = !silenciado; });
    this.niveles.entrada = 0;
    r.ultimaVoz = -Infinity;
    this.actualizar({ micSilenciado: silenciado, estudianteHablando: false });
    try {
      const extendida = r.sesion as SesionExtendida;
      if (extendida.silenciarEntrada) extendida.silenciarEntrada(silenciado);
      else if (silenciado) r.sesion.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      this.fallar(r, "Se perdió la conexión. Vuelve a conectar para seguir conversando.");
    }
  };

  enviarTexto = (texto: string): boolean => {
    const r = this.actual;
    const limpio = texto.trim();
    if (!r?.sesion || this.snapshot.estado !== "en_vivo" || !limpio) return false;
    this.pararReproduccion(r);
    r.transcripciones = {};
    try {
      this.enviarAlBackend(r.sesion, limpio);
      this.transcribir(r, "estudiante", limpio, true, true);
      this.actualizar({ esperandoRespuesta: true, tutorHablando: false });
      return true;
    } catch {
      this.fallar(r, "No pudimos enviar el mensaje. Vuelve a conectar e inténtalo de nuevo.");
      return false;
    }
  };

  iniciar = async (escenarioId: string, nivel: string | null, configuracion: ConfiguracionPractica = CONFIGURACION_INICIAL) => {
    if (this.actual) return;
    const nivelValido = ["sin_evaluar", "A1", "A2", "B1", "B2", "C1", "C2"].includes(nivel ?? "") ? nivel as Nivel : null;
    const r: Recursos = {
      sesion: null, contexto: null, reproduccion: null, flujo: null, captura: null, analizador: null,
      fuentes: new Set(), proximoInicio: 0, ultimaVoz: -Infinity, transcripciones: {}, pulsacion: false, soltando: false, cerrando: false,
      audioRemoto: null, remotoHablando: false, remotoSonando: false, ultimaSalida: -Infinity, vozClaraMs: 0, vozTotalMs: 0,
      escenarioId, nivel: nivelValido, historial: [], historialMensajes: new Map(), historialItems: new Map(),
      sesionId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fecha: fechaLocal(), modelo: "", conectadaEn: null, usos: new Map(),
      decisiones: { activas: true, enCurso: false, pendiente: false, firma: "", fallos: 0, estado: ESTADO_PEDAGOGICO_INICIAL, guiaPendiente: "" },
    };
    this.actual = r;
    this.actualizar({ ...INICIAL, mensajes: [], estado: "conectando", configuracion: { ...configuracion }, papelActual: configuracion.papel, micSilenciado: configuracion.escucha === "pulsar" });
    r.timeout = setTimeout(() => this.fallar(r, "La conexión está tardando demasiado. Revisa el permiso del micrófono y tu conexión e inténtalo de nuevo."), 30000);
    let preparandoAudio = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.fallar(r, "Abre la app en una dirección HTTPS o en localhost para usar el micrófono.");
        return;
      }
      // Unlock in the click handler, before awaiting permissions (Safari/iOS).
      r.contexto = new AudioContext({ sampleRate: 16000 });
      // Keep the tutor's 24kHz voice quality instead of downsampling playback to 16kHz.
      r.reproduccion = new AudioContext({ sampleRate: 24000 });
      const desbloqueo = Promise.all([r.contexto.resume(), r.reproduccion.resume()]);
      void desbloqueo.catch(() => {});
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false,
      } });
      if (this.actual !== r) { flujo.getTracks().forEach((pista) => pista.stop()); return; }
      r.flujo = flujo;
      await desbloqueo;
      if (this.actual !== r) return;
      flujo.getAudioTracks().forEach((pista) => {
        pista.enabled = configuracion.escucha !== "pulsar";
        pista.onended = () => this.fallar(r, "El micrófono se desconectó. Revísalo y vuelve a conectar.");
      });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      try { await r.contexto.audioWorklet.addModule(url); }
      finally { URL.revokeObjectURL(url); }
      if (this.actual !== r) return;
      r.captura = new AudioWorkletNode(r.contexto, "captura-pcm");
      r.captura.port.onmessage = (evento: MessageEvent<Float32Array | "flushed">) => {
        if (evento.data === "flushed") { if (r.soltando) this.terminarPulsacion(r); }
        else this.capturar(r, evento.data);
      };
      r.contexto.createMediaStreamSource(flujo).connect(r.captura);
      r.captura.connect(r.contexto.destination);
      r.analizador = r.reproduccion.createAnalyser();
      r.analizador.fftSize = 256;
      r.analizador.connect(r.reproduccion.destination);
      const muestrasSalida = new Float32Array(r.analizador.fftSize);
      r.medidor = setInterval(() => {
        r.analizador!.getFloatTimeDomainData(muestrasSalida);
        this.niveles.salida = Math.min(1, Math.sqrt(muestrasSalida.reduce((suma, valor) => suma + valor * valor, 0) / muestrasSalida.length) * 6);
        if (!r.audioRemoto || this.actual !== r) return;
        if (this.niveles.salida > 0.05) r.ultimaSalida = performance.now();
        const sonando = performance.now() - r.ultimaSalida < 600;
        if (sonando !== r.remotoSonando) this.vozRemota(r, { sonando });
      }, 50);
      preparandoAudio = false;
      const datos = await this.dependencias.crearToken({ escenarioId, nivel: nivelValido, configuracion });
      if (this.actual !== r) return;
      r.modelo = datos.modelo;
      const sesion = await this.dependencias.conectar(datos, {
        onmessage: (mensaje) => {
          try { this.recibir(r, mensaje); }
          catch { this.fallar(r, "No pudimos reproducir la respuesta. Vuelve a conectar para continuar."); }
        },
        onerror: () => this.fallar(r, "No pudimos mantener la conexión de voz. Inténtalo de nuevo."),
        onclose: () => this.fallar(r, "La conexión de voz terminó. Puedes iniciar una nueva conversación."),
      }, configuracion, {
        flujo: r.flujo,
        actividad: () => ({ clara: r.vozClaraMs, total: r.vozTotalMs }),
        salida: (flujoRemoto) => {
          if (this.actual !== r || !r.reproduccion || !r.analizador) return;
          const reproduccion = r.reproduccion;
          const analizador = r.analizador;
          const audio = new Audio();
          audio.autoplay = true;
          audio.srcObject = flujoRemoto;
          r.audioRemoto = audio;
          analizador.disconnect();
          reproduccion.createMediaStreamSource(flujoRemoto).connect(analizador);
          void audio.play().catch(() => {
            if (this.actual === r && r.audioRemoto === audio) analizador.connect(reproduccion.destination);
          });
        },
      });
      if (this.actual !== r) { sesion.close(); return; }
      r.sesion = sesion;
      if (configuracion.escucha === "pulsar") (sesion as SesionExtendida).silenciarEntrada?.(true);
      clearTimeout(r.timeout);
      // Sessions are designed for 10-15 minutes; end them automatically with a summary.
      r.timeout = setTimeout(() => { if (this.actual === r) this.cerrarConResumen(); }, MINUTOS_SESION_VOZ * 60 * 1000);
      r.conectadaEn = Date.now();
      this.actualizar({ estado: "en_vivo", inicio: r.conectadaEn, esperandoRespuesta: true });
      // System instructions alone do not trigger a spoken greeting.
      const apertura = configuracion.modo === "profesor"
        ? `Greet me now, out loud, without waiting for me to speak first. Speak in ${configuracion.idiomaAyuda === "espanol" ? "Spanish" : "English"} for your greeting and explanations, and English only for practice examples. ${configuracion.tema.trim() ? "Start with a brief explanation and example about my chosen learning goal." : "Ask what I would like to learn."} Then pause and listen.`
        : "Greet me now, out loud, without waiting for me to speak first. Use a short natural English opening in character for the assigned mode and roles. Then pause and listen.";
      this.instruir(r, sesion, apertura);
    } catch (error) {
      this.fallar(r, preparandoAudio ? errorMicrofono(error) : "No pudimos conectar con el tutor. Inténtalo de nuevo en unos momentos.");
    }
  };
}
