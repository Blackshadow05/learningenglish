"use client";

import { useState } from "react";
import { interests, placementQuestions } from "./demo-data";
import { Icon } from "./icons";
import { Modal, useLearning } from "./learning-provider";

export function Onboarding() {
  const { setAssessmentOpen, selectedInterests, setInterests, setLevel, goal, setGoal } = useLearning();
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const done = step === placementQuestions.length;
  const score = answers.filter((answer, index) => answer === placementQuestions[index].answer).length;
  const result = score <= 1 ? "A1" : score <= 2 ? "A2" : score <= 4 ? "B1" : "B2";
  function next() { if (selected === null) return; setAnswers([...answers, selected]); setSelected(null); setStep(step + 1); }
  return <Modal title="Tu punto de partida" onClose={() => setAssessmentOpen(false)}>
    {step === -1 ? <><div className="modal-emblem"><Icon name="sparkles" size={28}/></div><h2>Tu inglés. Tus objetivos.</h2><p className="muted">Primero, cuéntanos qué te mueve. Después, cinco preguntas para probar tu ruta personalizada.</p><h3 className="field-title">¿Para qué quieres aprender?</h3><div className="interest-grid">{interests.map(item => <button key={item.name} className={`interest-option ${selectedInterests.includes(item.name) ? "selected" : ""}`} aria-pressed={selectedInterests.includes(item.name)} onClick={() => setInterests(selectedInterests.includes(item.name) ? selectedInterests.filter(i => i !== item.name) : [...selectedInterests, item.name])}><Icon name={item.icon}/>{item.name}{selectedInterests.includes(item.name) && <Icon name="check" size={16}/>}</button>)}</div><h3 className="field-title">Un ratito al día</h3><div className="segmented">{[5, 15, 30].map(minutes => <button key={minutes} className={goal === minutes ? "active" : ""} aria-pressed={goal === minutes} onClick={() => setGoal(minutes)}>{minutes} min <span>{minutes === 5 ? "Sin prisa" : minutes === 15 ? "Paso a paso" : "A por todo"}</span></button>)}</div><button className="button primary full" disabled={!selectedInterests.length} onClick={() => setStep(0)}>Descubrir mi nivel <Icon name="arrow" size={18}/></button><p className="fine-print">Evaluación de demostración · unos 2 minutos</p></> : done ? <div className="assessment-result"><div className="level-result">{result}</div><span className="eyebrow">UN PUNTO DE PARTIDA, NO UN LÍMITE</span><h2>Tu camino empieza aquí.</h2><p className="muted">Acertaste {score} de 5 preguntas. Empezaremos con contenido de nivel {result} sobre {selectedInterests.join(" y ").toLowerCase()}.</p><div className="soft-note"><Icon name="help"/><span>Este resultado es orientativo. La evaluación completa también medirá listening y speaking.</span></div><button className="button primary full" onClick={() => { setLevel(result); setAssessmentOpen(false); }}>Explorar mi plan <Icon name="arrow" size={18}/></button></div> : <><div className="flex-between"><span className="muted">Pregunta {step + 1} de {placementQuestions.length}</span><span className="tag">Gramática y comprensión</span></div><div className="progress-track assessment-track"><i style={{ width: `${(step / placementQuestions.length) * 100}%` }}/></div><h2 className="question" lang="en">{placementQuestions[step].question}</h2><div className="answer-list">{placementQuestions[step].options.map((option, index) => <button key={option} aria-pressed={selected === index} className={`answer-option ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span>{option}{selected === index && <Icon name="check"/>}</button>)}</div><button className="button primary full" disabled={selected === null} onClick={next}>{step === 4 ? "Ver mi resultado" : "Siguiente"}<Icon name="arrow" size={18}/></button><button className="text-button skip" onClick={() => { setAnswers([...answers, -1]); setSelected(null); setStep(step + 1); }}>Todavía no lo sé</button></>}
  </Modal>;
}

export function Preferences({ onClose }: { onClose: () => void }) {
  const { selectedInterests, setInterests, goal, setGoal, notify } = useLearning();
  const [draft, setDraft] = useState(selectedInterests);
  const [minutes, setMinutes] = useState(goal);
  return <Modal title="A tu manera" onClose={onClose}><h2>Hazlo más tuyo.</h2><p className="muted">Tus intereses le dan dirección a lo que aprendes.</p><div className="interest-grid preferences-grid">{interests.map(item => <button key={item.name} className={`interest-option ${draft.includes(item.name) ? "selected" : ""}`} aria-pressed={draft.includes(item.name)} onClick={() => setDraft(draft.includes(item.name) ? draft.filter(i => i !== item.name) : [...draft, item.name])}><Icon name={item.icon}/>{item.name}</button>)}</div><h3 className="field-title">Mi meta diaria</h3><div className="segmented">{[5, 15, 30].map(value => <button key={value} className={minutes === value ? "active" : ""} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{value} minutos</button>)}</div><button className="button primary full" disabled={!draft.length} onClick={() => { setInterests(draft); setGoal(minutes); notify("Tu plan se ha actualizado para esta sesión."); onClose(); }}>Guardar preferencias<Icon name="check" size={18}/></button></Modal>;
}
