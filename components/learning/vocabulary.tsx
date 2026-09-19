"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "./icons";
import { Modal, useLearning } from "./learning-provider";
import type { Word } from "./demo-data";

export function Vocabulary() {
  const searchParams = useSearchParams();
  const { vocabulary, planCargando, level, speak, rateWord, now } = useLearning();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(searchParams.get("topic") ?? "Todas");
  const [reviewing, setReviewing] = useState(searchParams.get("review") === "true");
  const [queue, setQueue] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [detail, setDetail] = useState<Word | null>(null);
  const ranks = ["A1", "A2", "B1", "B2"];
  const categories = Array.from(new Set(vocabulary.map(word => word.category)));
  const activeCategory = category === "Todas" || categories.includes(category) ? category : "Todas";
  const filtered = vocabulary.filter(word => (activeCategory === "Todas" || word.category === activeCategory) && `${word.word} ${word.translation}`.toLowerCase().includes(query.toLowerCase()));
  const due = vocabulary.filter(word => word.due <= now);
  const current = vocabulary.find(word => word.id === queue[0]);
  function startReview() { setQueue(due.map(word => word.id)); setReviewed(0); setRevealed(false); setReviewing(true); }
  function rate(rating: number) { if (!current) return; rateWord(current.id, rating); setQueue(rest => rating === 0 ? [...rest.slice(1), current.id] : rest.slice(1)); setReviewed(reviewed + 1); setRevealed(false); }
  if (planCargando) return <p className="loading-message">Preparando tus palabras…</p>;
  return <>
    <section className="page-heading">
      <div className="eyebrow">TU VOCABULARIO DE HOY</div>
      <h1>Palabras que<br/>se quedan<span className="green-text">.</span></h1>
      <p>Un poco de práctica. Mucho por decir.</p>
    </section>
    <div className="vocab-summary">
      <div><strong>{vocabulary.length}</strong><span>en tu plan de hoy</span></div>
      <div><strong>{vocabulary.filter(word => word.mastery >= 80).length}</strong><span>muy familiares</span></div>
      <div><strong className="green-text">{due.length}</strong><span>para hoy</span></div>
    </div>
    <button className="review-banner" onClick={startReview}>
      <div className="feature-icon"><Icon name="repeat" size={23}/></div>
      <div>
        <strong>{due.length ? "Un buen momento para repasar" : "Todo al día. ¡Bien hecho!"}</strong>
        <span>{due.length ? `${due.length} expresiones · a tu ritmo` : "Tus palabras volverán cuando las necesites"}</span>
      </div>
      <Icon name="arrow" size={20}/>
    </button>
    <label className="search-field">
      <Icon name="search" size={20}/>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar una palabra o frase" aria-label="Buscar vocabulario"/>
      {query && <button className="icon-button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}><Icon name="close" size={16}/></button>}
    </label>
    <div className="filter-scroll" aria-label="Filtrar vocabulario">
      {["Todas", ...categories].map(topic => <button key={topic} className={`filter-chip ${activeCategory === topic ? "active" : ""}`} aria-pressed={activeCategory === topic} onClick={() => setCategory(topic)}>{topic}</button>)}
    </div>
    <div className="section-heading compact"><h2>Tu vocabulario de hoy</h2><span className="section-caption">{filtered.length} expresiones</span></div>
    <div className="word-list">
      {filtered.map(word => <button key={word.id} className="word-row" onClick={() => setDetail(word)}>
        <span className={`word-symbol ${word.mastery >= 80 ? "mastered" : ""}`}><Icon name={word.mastery >= 80 ? "check" : "book"} size={21}/></span>
        <span className="word-info">
          <strong lang="en">{word.word}</strong>
          <span>{word.translation}</span>
          <span className="word-tags">{word.category}<i>·</i>{word.level}{level && ranks.indexOf(word.level) <= ranks.indexOf(level) && <em>Para tu nivel</em>}</span>
        </span>
        <span className="word-meter" aria-label={`Familiaridad de ejemplo: ${word.mastery}%`}><i style={{ height: `${word.mastery}%` }}/></span>
        <Icon name="chevron" size={16}/>
      </button>)}
    </div>
    {!filtered.length && <div className="empty-state">
      <Icon name="search" size={32}/>
      <h3>No encontramos esa palabra</h3>
      <p>Prueba otra búsqueda o cambia de categoría.</p>
      <button className="button secondary" onClick={() => { setQuery(""); setCategory("Todas"); }}>Ver todas las palabras</button>
    </div>}
    <div className="soft-note srs-note"><Icon name="leaf"/><span>Si te cuesta recordarla, volverá antes. Si la recuerdas bien, dejaremos pasar más tiempo. Así crece tu memoria.</span></div>
    {detail && <Modal title={detail.category} onClose={() => setDetail(null)}>
      <span className="tag">{detail.level} · {detail.mastery >= 80 ? "Muy familiar" : "En práctica"}</span>
      <h2 className="word-title" lang="en">{detail.word}</h2>
      <button className="pronunciation" onClick={() => speak(detail.word)}><Icon name="volume" size={20}/>{detail.pronunciation || "Escuchar pronunciación"}</button>
      <h3 className="translation">{detail.translation}</h3>
      {detail.example && <div className="example-box">
        <span className="eyebrow">EN LA VIDA REAL</span>
        <p lang="en">“{detail.example}”</p>
        <button className="text-button" onClick={() => speak(detail.example)}><Icon name="volume" size={18}/>Escuchar ejemplo</button>
      </div>}
      <div className="soft-note"><Icon name="repeat"/><span>{detail.due === 0 ? "Lista para tu próximo repaso." : detail.interval === 0 ? "Volverá en un minuto para intentarlo otra vez." : `Próximo repaso en ${detail.interval} días.`}</span></div>
      <button className="button primary full" onClick={() => { setQueue([detail.id]); setReviewed(0); setRevealed(false); setDetail(null); setReviewing(true); }}>Practicar esta expresión<Icon name="arrow" size={18}/></button>
    </Modal>}
    {reviewing && <Modal title="Tu momento de repaso" onClose={() => setReviewing(false)}>
      {current ? <>
        <div className="flex-between"><span className="tag">{current.category}</span><span className="muted">{queue.length} por repasar</span></div>
        <div className="flashcard">
          <span className="eyebrow">¿RECUERDAS QUÉ SIGNIFICA?</span>
          <h2 lang="en">{current.word}</h2>
          <button className="icon-button sound-button" onClick={() => speak(current.word)} aria-label="Escuchar palabra"><Icon name="volume" size={24}/></button>
          {revealed ? <div className="revealed-answer"><h3>{current.translation}</h3>{current.example && <p lang="en">“{current.example}”</p>}</div> : <p className="muted">Piensa en la respuesta antes de darle la vuelta.</p>}
        </div>
        {revealed ? <>
          <h3 className="rating-heading">¿Qué tal la recordaste?</h3>
          <div className="rating-grid">
            {[{ name: "Otra vez", time: "1 min" }, { name: "Me costó", time: "1 día" }, { name: "Bien", time: `${Math.max(3, current.interval * 2)} días` }, { name: "Muy fácil", time: `${Math.max(3, Math.round(current.interval * 3.5))} días` }].map((rating, index) => <button className={`rating rating-${index}`} key={rating.name} onClick={() => rate(index)}><strong>{rating.name}</strong><span>{rating.time}</span></button>)}
          </div>
          <p className="fine-print">La próxima fecha cambia con tu respuesta.</p>
        </> : <button className="button primary full" onClick={() => setRevealed(true)}>Mostrar significado<Icon name="repeat" size={18}/></button>}
      </> : <div className="completion">
        <div className="modal-emblem"><Icon name="check" size={32}/></div>
        <h2>{reviewed ? "Un paso más. Bien hecho." : "Tu memoria está al día."}</h2>
        <p>{reviewed ? `Completaste ${reviewed} repasos. Tus próximas revisiones ya están organizadas en esta sesión.` : "No quedan palabras pendientes por ahora. Vuelve más tarde."}</p>
        <button className="button primary full" onClick={() => setReviewing(false)}>Volver a mis palabras<Icon name="arrow" size={18}/></button>
      </div>}
    </Modal>}
  </>;
}
