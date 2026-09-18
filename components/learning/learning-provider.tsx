"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { words, type Word } from "./demo-data";
import { Icon } from "./icons";

type LearningContext = {
  vocabulary: Word[]; selectedInterests: string[]; setInterests: (value: string[]) => void;
  level: string | null; setLevel: (level: string) => void; goal: number; setGoal: (goal: number) => void;
  provider: string; setProvider: (provider: string) => void; reviews: number; exerciseScore: number; now: number;
  recordExercise: (score: number) => void; rateWord: (id: number, rating: number) => void;
  assessmentOpen: boolean; setAssessmentOpen: (open: boolean) => void;
  notify: (message: string) => void; speak: (text: string) => void;
};
const Learning = createContext<LearningContext | null>(null);

export function LearningProvider({ children }: { children: ReactNode }) {
  const [vocabulary, setVocabulary] = useState(words);
  const [selectedInterests, setInterests] = useState(["Viajes", "Vida cotidiana"]);
  const [level, setLevel] = useState<string | null>(null);
  const [goal, setGoal] = useState(15);
  const [provider, setProvider] = useState("GPT Live 1");
  const [reviews, setReviews] = useState(0);
  const [exerciseScore, setExerciseScore] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => { const clock = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(clock); }, []);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(message: string) { setToast(message); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 4500); }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function rateWord(id: number, rating: number) {
    setVocabulary(current => current.map(word => {
      if (word.id !== id) return word;
      const interval = rating === 0 ? 0 : rating === 1 ? 1 : Math.max(3, Math.round(word.interval * (rating === 2 ? 2 : 3.5)));
      return { ...word, interval, mastery: Math.min(100, Math.max(0, word.mastery + [-20, 0, 15, 25][rating])), due: Date.now() + (rating === 0 ? 60000 : interval * 86400000) };
    }));
    setReviews(current => current + 1);
  }
  function speak(text: string) {
    if (!("speechSynthesis" in window)) { notify("La pronunciación no está disponible en este navegador."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "en-US"; utterance.rate = 0.85;
    utterance.onerror = () => notify("No se pudo reproducir la pronunciación. Inténtalo de nuevo.");
    window.speechSynthesis.speak(utterance);
  }
  return <Learning.Provider value={{ vocabulary, selectedInterests, setInterests, level, setLevel, goal, setGoal, provider, setProvider, reviews, exerciseScore, now, recordExercise: score => setExerciseScore(current => current + score), rateWord, assessmentOpen, setAssessmentOpen, notify, speak }}>{children}{toast && <div className="toast" role="status"><Icon name="check"/>{toast}<button aria-label="Cerrar aviso" onClick={() => setToast("")}><Icon name="close" size={16}/></button></div>}</Learning.Provider>;
}
export function useLearning() { const context = useContext(Learning); if (!context) throw new Error("LearningProvider is required"); return context; }

export function Modal({ children, title, onClose, wide = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={dialogRef} className={`modal ${wide ? "modal-wide" : ""}`} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}><div className="modal-top"><span className="eyebrow">{title}</span><button className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
