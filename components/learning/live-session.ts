import type { LiveCallbacks, LiveServerMessage, Session } from "@google/genai";

export type EstadoConversacion = "inactivo" | "conectando" | "en_vivo" | "finalizada" | "error";
export type MensajeConversacion = { id: number; rol: "estudiante" | "tutor"; texto: string };
type Nivel = "sin_evaluar" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type DatosSesion = { token: string; modelo: string; instruccion: string; voz: string };
type Dependencias = {
  crearToken: (args: { escenarioId: string; nivel: Nivel | null }) => Promise<DatosSesion>;
  conectar: (datos: DatosSesion, callbacks: LiveCallbacks) => Promise<Session>;
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
};

const INICIAL: Snapshot = {
  estado: "inactivo", mensajes: [], error: "", micSilenciado: false,
  tutorHablando: false, estudianteHablando: false, esperandoRespuesta: false, inicio: null, fin: null,
};

// About 64ms per packet at 16kHz; output stays silent to avoid microphone feedback.
const WORKLET = `
class CapturaPcm extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(1024); this.offset = 0; }
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
  readonly niveles = { entrada: 0, salida: 0 };

  constructor(private dependencias: Dependencias) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private actualizar(cambios: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...cambios };
    this.listeners.forEach((listener) => listener());
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
    clearTimeout(r.timeout);
    clearInterval(r.medidor);
    this.pararReproduccion(r);
    if (r.captura) {
      r.captura.port.onmessage = null;
      r.captura.disconnect();
      r.captura.port.close();
    }
    r.flujo?.getTracks().forEach((pista) => { pista.onended = null; pista.stop(); });
    r.analizador?.disconnect();
    if (r.contexto && r.contexto.state !== "closed") void r.contexto.close().catch(() => {});
    if (r.reproduccion && r.reproduccion.state !== "closed") void r.reproduccion.close().catch(() => {});
    try { r.sesion?.close(); } catch { /* The transport may already be closed. */ }
    this.niveles.entrada = this.niveles.salida = 0;
  }

  private fallar(r: Recursos, error: string) {
    if (this.actual !== r) return;
    this.liberar();
    this.actualizar({ estado: "error", error, fin: Date.now(), tutorHablando: false, estudianteHablando: false, esperandoRespuesta: false });
  }

  finalizar = () => {
    this.liberar();
    this.actualizar({ estado: "finalizada", fin: this.snapshot.fin ?? Date.now(), tutorHablando: false, estudianteHablando: false, esperandoRespuesta: false });
  };

  private transcribir(r: Recursos, rol: MensajeConversacion["rol"], texto?: string, final = false) {
    if (texto) {
      const id = r.transcripciones[rol];
      const anterior = this.snapshot.mensajes.find((mensaje) => mensaje.id === id);
      if (anterior) {
        this.actualizar({ mensajes: this.snapshot.mensajes.map((mensaje) => mensaje.id === id ? { ...mensaje, texto: mensaje.texto + texto } : mensaje) });
      } else {
        const nuevo = { id: ++this.siguienteId, rol, texto };
        r.transcripciones[rol] = nuevo.id;
        this.actualizar({ mensajes: [...this.snapshot.mensajes, nuevo] });
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
    if (this.actual !== r || !r.sesion || this.snapshot.micSilenciado) return;
    let energia = 0;
    for (const muestra of muestras) energia += muestra * muestra;
    const rms = Math.sqrt(energia / muestras.length);
    this.niveles.entrada = Math.min(1, rms * 9);
    if (rms > 0.015) r.ultimaVoz = performance.now();
    const hablando = performance.now() - r.ultimaVoz < 800;
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
    if (!r?.sesion || this.snapshot.estado !== "en_vivo" || silenciado === this.snapshot.micSilenciado) return;
    // Disable the track as well as upload: switching to text must really mute capture.
    r.flujo?.getAudioTracks().forEach((pista) => { pista.enabled = !silenciado; });
    this.niveles.entrada = 0;
    r.ultimaVoz = -Infinity;
    this.actualizar({ micSilenciado: silenciado, estudianteHablando: false });
    try {
      if (silenciado) r.sesion.sendRealtimeInput({ audioStreamEnd: true });
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
      r.sesion.sendClientContent({ turns: [{ role: "user", parts: [{ text: limpio }] }], turnComplete: true });
      this.transcribir(r, "estudiante", limpio, true);
      this.actualizar({ esperandoRespuesta: true, tutorHablando: false });
      return true;
    } catch {
      this.fallar(r, "No pudimos enviar el mensaje. Vuelve a conectar e inténtalo de nuevo.");
      return false;
    }
  };

  iniciar = async (escenarioId: string, nivel: string | null) => {
    if (this.actual) return;
    const r: Recursos = {
      sesion: null, contexto: null, reproduccion: null, flujo: null, captura: null, analizador: null,
      fuentes: new Set(), proximoInicio: 0, ultimaVoz: -Infinity, transcripciones: {},
    };
    this.actual = r;
    this.actualizar({ ...INICIAL, mensajes: [], estado: "conectando" });
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
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } });
      if (this.actual !== r) { flujo.getTracks().forEach((pista) => pista.stop()); return; }
      r.flujo = flujo;
      await desbloqueo;
      if (this.actual !== r) return;
      flujo.getAudioTracks().forEach((pista) => {
        pista.onended = () => this.fallar(r, "El micrófono se desconectó. Revísalo y vuelve a conectar.");
      });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      try { await r.contexto.audioWorklet.addModule(url); }
      finally { URL.revokeObjectURL(url); }
      if (this.actual !== r) return;
      r.captura = new AudioWorkletNode(r.contexto, "captura-pcm");
      r.captura.port.onmessage = (evento: MessageEvent<Float32Array>) => this.capturar(r, evento.data);
      r.contexto.createMediaStreamSource(flujo).connect(r.captura);
      r.captura.connect(r.contexto.destination);
      r.analizador = r.reproduccion.createAnalyser();
      r.analizador.fftSize = 256;
      r.analizador.connect(r.reproduccion.destination);
      const muestrasSalida = new Float32Array(r.analizador.fftSize);
      r.medidor = setInterval(() => {
        r.analizador!.getFloatTimeDomainData(muestrasSalida);
        this.niveles.salida = Math.min(1, Math.sqrt(muestrasSalida.reduce((suma, valor) => suma + valor * valor, 0) / muestrasSalida.length) * 6);
      }, 50);
      preparandoAudio = false;
      const nivelValido = ["sin_evaluar", "A1", "A2", "B1", "B2", "C1", "C2"].includes(nivel ?? "") ? nivel as Nivel : null;
      const datos = await this.dependencias.crearToken({ escenarioId, nivel: nivelValido });
      if (this.actual !== r) return;
      const sesion = await this.dependencias.conectar(datos, {
        onmessage: (mensaje) => {
          try { this.recibir(r, mensaje); }
          catch { this.fallar(r, "No pudimos reproducir la respuesta. Vuelve a conectar para continuar."); }
        },
        onerror: () => this.fallar(r, "No pudimos mantener la conexión de voz. Inténtalo de nuevo."),
        onclose: () => this.fallar(r, "La conexión de voz terminó. Puedes iniciar una nueva conversación."),
      });
      if (this.actual !== r) { sesion.close(); return; }
      r.sesion = sesion;
      clearTimeout(r.timeout);
      this.actualizar({ estado: "en_vivo", inicio: Date.now(), esperandoRespuesta: true });
      // System instructions alone do not trigger a spoken greeting.
      sesion.sendClientContent({
        turns: [{ role: "user", parts: [{ text: "Begin the practice now. Greet me briefly in character and ask your first question, then wait for my answer." }] }],
        turnComplete: true,
      });
    } catch (error) {
      this.fallar(r, preparandoAudio ? errorMicrofono(error) : "No pudimos conectar con el tutor. Inténtalo de nuevo en unos momentos.");
    }
  };
}
