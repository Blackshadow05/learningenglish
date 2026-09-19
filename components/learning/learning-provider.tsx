"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FraseDia, Word } from "./demo-data";
import { Icon } from "./icons";

const NIVELES_ACTIVOS: (1 | 2 | 3)[] = [1, 2];
const PALABRAS_POR_DIA = 10;
const FRASES_POR_DIA = 3;

type ProgresoLocal = { mastery: number; interval: number; due: number };
const PROGRESO_INICIAL: ProgresoLocal = { mastery: 0, interval: 0, due: 0 };

type LearningContext = {
  vocabulary: Word[]; frases: FraseDia[]; planCargando: boolean;
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
  useEffect(() => {
    const actualizarDia = () => { const siguiente = Math.floor(Date.now() / 86400000); setDia(current => current === siguiente ? current : siguiente); };
    const arranque = setTimeout(actualizarDia, 0);
    const reloj = setInterval(actualizarDia, 60000);
    return () => { clearTimeout(arranque); clearInterval(reloj); };
  }, []);
  const plan = useQuery(api.vocabulario.obtenerPlanDiario, dia === null ? "skip" : { niveles: NIVELES_ACTIVOS, dia, cantidadPalabras: PALABRAS_POR_DIA, cantidadFrases: FRASES_POR_DIA });
  const [progreso, setProgreso] = useState<Record<string, ProgresoLocal>>({});
  const [selectedInterests, setInterests] = useState(["Viajes", "Vida cotidiana"]);
  const [level, setLevel] = useState<string | null>(null);
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
  const vocabulary: Word[] = (plan?.palabras ?? []).map(doc => {
    const local = progreso[doc._id] ?? PROGRESO_INICIAL;
    return { id: doc._id, word: doc.textoIngles, translation: doc.traduccionEspanol, pronunciation: doc.pronunciacionIPA ?? "", example: doc.ejemploIngles ?? "", category: doc.categoria, level: doc.nivel, tipo: doc.tipo, area: doc.area ?? "general", nivelBasico: doc.nivelBasico ?? 1, mastery: local.mastery, interval: local.interval, due: local.due };
  });
  const frases: FraseDia[] = (plan?.frases ?? []).map(doc => ({ id: doc._id, textoIngles: doc.textoIngles, traduccionEspanol: doc.traduccionEspanol, level: doc.nivel, category: doc.categoria }));
  function rateWord(id: string, rating: number) {
    setProgreso(current => {
      const anterior = current[id] ?? PROGRESO_INICIAL;
      const interval = rating === 0 ? 0 : rating === 1 ? 1 : Math.max(3, Math.round(anterior.interval * (rating === 2 ? 2 : 3.5)));
      const mastery = Math.min(100, Math.max(0, anterior.mastery + [-20, 0, 15, 25][rating]));
      return { ...current, [id]: { mastery, interval, due: Date.now() + (rating === 0 ? 60000 : interval * 86400000) } };
    });
    setReviews(current => current + 1);
  }
  function speak(text: string) {
    if (!("speechSynthesis" in window)) { notify("La pronunciación no está disponible en este navegador."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "en-US"; utterance.rate = 0.85;
    utterance.onerror = () => notify("No se pudo reproducir la pronunciación. Inténtalo de nuevo.");
    window.speechSynthesis.speak(utterance);
  }
  return <Learning.Provider value={{ vocabulary, frases, planCargando: plan === undefined, selectedInterests, setInterests, level, setLevel, goal, setGoal, provider, setProvider, reviews, exerciseScore, now, recordExercise: score => setExerciseScore(current => current + score), rateWord, assessmentOpen, setAssessmentOpen, notify, speak }}>{children}{toast && <div className="toast" role="status"><Icon name="check"/>{toast}<button aria-label="Cerrar aviso" onClick={() => setToast("")}><Icon name="close" size={16}/></button></div>}</Learning.Provider>;
}
export function useLearning() { const context = useContext(Learning); if (!context) throw new Error("LearningProvider is required"); return context; }

export function Modal({ children, title, onClose, wide = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={dialogRef} className={`modal ${wide ? "modal-wide" : ""}`} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}><div className="modal-top"><span className="eyebrow">{title}</span><button className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
