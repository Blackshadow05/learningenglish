"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { FraseDia, TemaSugerido, Word } from "./demo-data";
import { Icon } from "./icons";
import { fechaLocal, siguienteRepaso } from "../../lib/learning-memory";
import { NIVELES_CEFR } from "../../lib/practice-decisions";

const NIVELES_ACTIVOS: (1 | 2 | 3)[] = [1, 2];
const PALABRAS_POR_DIA = 10;
const FRASES_POR_DIA = 3;

type ProgresoLocal = { mastery: number; interval: number; due: number };
const PROGRESO_INICIAL: ProgresoLocal = { mastery: 0, interval: 0, due: 0 };

type LearningContext = {
  vocabulary: Word[]; frases: FraseDia[]; planCargando: boolean; vocabularioPersonal: boolean;
  temaSugerido: TemaSugerido | null; temasRefuerzo: string[];
  selectedInterests: string[]; setInterests: (value: string[]) => void;
  level: string | null; setLevel: (level: string) => void; goal: number; setGoal: (goal: number) => void;
  provider: string; setProvider: (provider: string) => void; reviews: number; exerciseScore: number; now: number;
  recordExercise: (score: number) => void; rateWord: (id: string, rating: number) => void;
  assessmentOpen: boolean; setAssessmentOpen: (open: boolean) => void;
  notify: (message: string) => void; speak: (text: string) => void;
};
const Learning = createContext<LearningContext | null>(null);

export function LearningProvider({ children }: { children: ReactNode }) {
  const [dia, setDia] = useState<number | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  useEffect(() => {
    const actualizarDia = () => {
      const siguiente = Math.floor(Date.now() / 86400000);
      setDia(current => current === siguiente ? current : siguiente);
      const hoy = fechaLocal();
      setFecha(current => current === hoy ? current : hoy);
    };
    const arranque = setTimeout(actualizarDia, 0);
    const reloj = setInterval(actualizarDia, 60000);
    return () => { clearTimeout(arranque); clearInterval(reloj); };
  }, []);
  const plan = useQuery(api.vocabulario.obtenerPlanDiario, dia === null ? "skip" : { niveles: NIVELES_ACTIVOS, dia, cantidadPalabras: PALABRAS_POR_DIA, cantidadFrases: FRASES_POR_DIA });
  const planPersonal = useQuery(api.aprendizaje.planDelDia, fecha === null ? "skip" : { fecha });
  const prepararDia = useAction(api.aprendizaje.prepararDia);
  const calificarPalabra = useMutation(api.aprendizaje.calificarPalabra);
  const solicitado = useRef<string | null>(null);
  const [falloPlan, setFalloPlan] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<Record<string, ProgresoLocal>>({});
  const [selectedInterests, setInterests] = useState(["Viajes", "Vida cotidiana"]);
  const [level, setLevel] = useState<string | null>(null);
  useEffect(() => {
    if (planPersonal !== null || fecha === null || solicitado.current === fecha) return;
    solicitado.current = fecha;
    prepararDia({ fecha, nivel: NIVELES_CEFR.find(valor => valor === level) ?? null }).catch(() => setFalloPlan(fecha));
  }, [planPersonal, fecha, level, prepararDia]);
  const [goal, setGoal] = useState(15);
  const [provider, setProvider] = useState("Gemini 3.8 Live");
  const [reviews, setReviews] = useState(0);
  const [exerciseScore, setExerciseScore] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => { const clock = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(clock); }, []);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(message: string) { setToast(message); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 4500); }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const personales: Word[] = (planPersonal?.palabras ?? []).map(palabra => ({ id: palabra.id, word: palabra.texto, translation: palabra.traduccion, meaning: palabra.significado, pronunciation: "", example: palabra.ejemplo, category: palabra.tema, level: palabra.nivel === "sin_evaluar" ? "A2" : palabra.nivel, tipo: palabra.tipo, area: "general", nivelBasico: 1, mastery: palabra.dominio, interval: palabra.intervaloDias, due: palabra.proximoRepasoEn, struggles: palabra.vecesCosto, struggleNote: palabra.ultimoCosto, origen: "personal" }));
  const conocidas = new Set(personales.map(word => word.word.toLowerCase()));
  const base: Word[] = (plan?.palabras ?? []).filter(doc => !conocidas.has(doc.textoIngles.toLowerCase())).map(doc => {
    const local = progreso[doc._id] ?? PROGRESO_INICIAL;
    return { id: doc._id, word: doc.textoIngles, translation: doc.traduccionEspanol, meaning: doc.explicacionEspanol ?? "", pronunciation: doc.pronunciacionIPA ?? "", example: doc.ejemploIngles ?? "", category: doc.categoria, level: doc.nivel, tipo: doc.tipo, area: doc.area ?? "general", nivelBasico: doc.nivelBasico ?? 1, mastery: local.mastery, interval: local.interval, due: local.due, struggles: 0, struggleNote: "", origen: "base" };
  });
  const vocabulary = [...personales, ...base].slice(0, Math.max(PALABRAS_POR_DIA, personales.length));
  const personalPendiente = fecha === null || planPersonal === undefined || planPersonal?.estado === "generando" || (planPersonal === null && falloPlan !== fecha);
  const frases: FraseDia[] = (plan?.frases ?? []).map(doc => ({ id: doc._id, textoIngles: doc.textoIngles, traduccionEspanol: doc.traduccionEspanol, level: doc.nivel, category: doc.categoria }));
  function rateWord(id: string, rating: number) {
    if (vocabulary.find(word => word.id === id)?.origen === "personal") {
      calificarPalabra({ id: id as Id<"vocabularioPersonal">, calificacion: rating }).catch(() => notify("No pudimos guardar tu repaso. Inténtalo de nuevo."));
    } else {
      setProgreso(current => {
        const anterior = current[id] ?? PROGRESO_INICIAL;
        const siguiente = siguienteRepaso({ dominio: anterior.mastery, intervaloDias: anterior.interval }, rating, Date.now());
        return { ...current, [id]: { mastery: siguiente.dominio, interval: siguiente.intervaloDias, due: siguiente.proximoRepasoEn } };
      });
    }
    setReviews(current => current + 1);
  }
  function speak(text: string) {
    if (!("speechSynthesis" in window)) { notify("La pronunciación no está disponible en este navegador."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "en-US"; utterance.rate = 0.85;
    utterance.onerror = () => notify("No se pudo reproducir la pronunciación. Inténtalo de nuevo.");
    window.speechSynthesis.speak(utterance);
  }
  return <Learning.Provider value={{ vocabulary, frases, planCargando: plan === undefined || personalPendiente, vocabularioPersonal: personales.length > 0, temaSugerido: planPersonal?.tema ?? null, temasRefuerzo: planPersonal?.otrosTemas ?? [], selectedInterests, setInterests, level, setLevel, goal, setGoal, provider, setProvider, reviews, exerciseScore, now, recordExercise: score => setExerciseScore(current => current + score), rateWord, assessmentOpen, setAssessmentOpen, notify, speak }}>{children}{toast && <div className="toast" role="status"><Icon name="check"/>{toast}<button aria-label="Cerrar aviso" onClick={() => setToast("")}><Icon name="close" size={16}/></button></div>}</Learning.Provider>;
}
export function useLearning() { const context = useContext(Learning); if (!context) throw new Error("LearningProvider is required"); return context; }

export function Modal({ children, title, onClose, wide = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={dialogRef} className={`modal ${wide ? "modal-wide" : ""}`} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}><div className="modal-top"><span className="eyebrow">{title}</span><button className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
