"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { Modal, useLearning } from "./learning-provider";

type Game = "match" | "build" | "choose";
const sentences = [
  { translation: "Me gustaría un café, por favor.", answer: ["I'd", "like", "a", "coffee,", "please."], tokens: ["coffee,", "I'd", "please.", "a", "like"] },
  { translation: "Pongámonos al día tomando un café.", answer: ["Let's", "catch", "up", "over", "coffee."], tokens: ["over", "coffee.", "Let's", "up", "catch"] },
  { translation: "Espero conocerte con ilusión.", answer: ["I", "look", "forward", "to", "meeting", "you."], tokens: ["meeting", "to", "I", "you.", "forward", "look"] },
];
export function Exercises() {
  const { vocabulary, recordExercise, exerciseScore } = useLearning();
  const [game, setGame] = useState<Game | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [round, setRound] = useState(0);
  const [built, setBuilt] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [complete, setComplete] = useState(false);
  const [points, setPoints] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const practiceWords = [...vocabulary].sort((a, b) => a.mastery - b.mastery).slice(0, 4);
  const translations = [practiceWords[2], practiceWords[0], practiceWords[3], practiceWords[1]];
  function start(type: Game) { setGame(type); setMatched([]); setLeft(null); setFeedback(""); setRound(0); setBuilt([]); setChecked(false); setComplete(false); setPoints(0); setChoice(null); }
  function finish(score: number) { setComplete(true); recordExercise(score); }
  function match(id: number) {
    if (left === null) { setFeedback("Primero elige una expresión en inglés."); return; }
    if (left === id) { const next = [...matched, id]; setMatched(next); setPoints(points + 10); setFeedback("¡Eso es! Una conexión más."); if (next.length === 4) finish(points + 10); }
    else setFeedback("Casi. Busca otro significado para esa expresión.");
    setLeft(null);
  }
  function check() {
    const isCorrect = game === "build" ? built.join(" ") === sentences[round].answer.join(" ") : choice === practiceWords[round].id;
    setCorrect(isCorrect); setChecked(true); if (isCorrect) setPoints(points + 10);
  }
  function next() { if (round === 2) { finish(points); return; } setRound(round + 1); setBuilt([]); setChecked(false); setChoice(null); }
  return <><section className="page-heading"><div className="eyebrow">APRENDER TAMBIÉN ES JUGAR</div><h1>Un reto pequeño.<br/>Un gran «ya sé»<span className="orange-text">.</span></h1><p>Haz tuyas las palabras, una partida a la vez.</p></section><div className="play-banner"><div><span className="tiny-tag">TU PRÓXIMO PEQUEÑO LOGRO</span><h2>Lo sabes más<br/>de lo que crees.</h2><p>Vamos a comprobarlo.</p></div><div className="play-blocks" aria-hidden="true"><span>A</span><span>✦</span><span>+</span></div></div><div className="section-heading"><h2>Elige tu reto</h2><span className="tag orange-tag">{exerciseScore} puntos</span></div><div className="game-list"><button className="game-option" onClick={() => start("match")}><span className="game-illustration match-illustration"><i>A</i><i>á</i></span><span><strong>Conecta las palabras</strong><small>Cada palabra tiene su otra mitad.</small><em>4 parejas · 2 min</em></span><Icon name="chevron" size={20}/></button><button className="game-option" onClick={() => start("build")}><span className="game-illustration build-illustration"><i>abc</i></span><span><strong>Dale forma a la frase</strong><small>Unas piezas, muchas posibilidades.</small><em>3 frases · 3 min</em></span><Icon name="chevron" size={20}/></button><button className="game-option" onClick={() => start("choose")}><span className="game-illustration choose-illustration"><Icon name="target" size={34}/></span><span><strong>Encuentra el significado</strong><small>Confía en lo que estás aprendiendo.</small><em>3 preguntas · 2 min</em></span><Icon name="chevron" size={20}/></button></div><div className="soft-note"><Icon name="sparkles"/><span>Los retos de vocabulario priorizan las palabras que todavía te cuestan. Repetir también es avanzar.</span></div>{game && <Modal title={game === "match" ? "Conecta las palabras" : game === "build" ? "Dale forma a la frase" : "Encuentra el significado"} onClose={() => setGame(null)}>{complete ? <div className="completion"><div className="celebration-star">✳</div><span className="tag">+{points} puntos</span><h2>¡Una partida más cerca!</h2><p>{points > 0 ? "Las palabras empiezan a sentirse más tuyas." : "Equivocarte también es parte de aprender. Puedes intentarlo otra vez."}</p><button className="button primary full" onClick={() => start(game)}>Volver a jugar<Icon name="repeat" size={18}/></button><button className="text-button skip" onClick={() => setGame(null)}>Ver otros retos</button></div> : game === "match" ? <><div className="flex-between"><p className="muted">Toca una expresión y su significado.</p><span className="tag">{matched.length}/4</span></div><div className="matching-grid"><div>{practiceWords.map(word => <button key={word.id} disabled={matched.includes(word.id)} className={`${left === word.id ? "selected" : ""} ${matched.includes(word.id) ? "matched" : ""}`} onClick={() => { setLeft(word.id); setFeedback(""); }}>{matched.includes(word.id) && <Icon name="check" size={16}/>}<span lang="en">{word.word}</span></button>)}</div><div>{translations.map(word => <button key={word.id} disabled={matched.includes(word.id)} className={matched.includes(word.id) ? "matched" : ""} onClick={() => match(word.id)}>{matched.includes(word.id) && <Icon name="check" size={16}/>}<span>{word.translation}</span></button>)}</div></div><p className="game-feedback" role="status">{feedback || "Cada conexión es un pequeño logro."}</p></> : <><div className="flex-between"><span className="tag">Reto {round + 1} de 3</span><span className="muted">{points} puntos</span></div><div className="progress-track assessment-track"><i style={{ width: `${round / 3 * 100}%` }}/></div>{game === "build" ? <><p className="eyebrow">ORDENA LA FRASE EN INGLÉS</p><h2 className="game-question">{sentences[round].translation}</h2><div className="sentence-drop" aria-label="Tu frase">{built.length ? built.map((token, index) => <button key={token} disabled={checked} onClick={() => setBuilt(built.filter((_, i) => i !== index))}>{token}<Icon name="close" size={12}/></button>) : <span>Toca las palabras para construirla</span>}</div><div className="token-bank">{sentences[round].tokens.map(token => <button key={token} disabled={built.includes(token) || checked} onClick={() => setBuilt([...built, token])}>{token}</button>)}</div></> : <><p className="eyebrow">¿QUÉ SIGNIFICA ESTA EXPRESIÓN?</p><h2 className="game-question" lang="en">{practiceWords[round].word}</h2><div className="answer-list">{translations.map(word => <button key={word.id} disabled={checked} className={`answer-option ${choice === word.id ? "selected" : ""} ${checked && word.id === practiceWords[round].id ? "correct-answer" : ""}`} onClick={() => setChoice(word.id)}>{word.translation}{choice === word.id && <Icon name="check" size={18}/>}</button>)}</div></>}{checked ? <><div className={`answer-feedback ${correct ? "is-correct" : "is-wrong"}`} role="status"><Icon name={correct ? "check" : "help"}/><div><strong>{correct ? "¡Así se dice!" : "Casi. Mira cómo se dice:"}</strong>{!correct && <p>{game === "build" ? sentences[round].answer.join(" ") : practiceWords[round].translation}</p>}</div></div><button className="button primary full" onClick={next}>{round === 2 ? "Ver resultado" : "Siguiente reto"}<Icon name="arrow" size={18}/></button></> : <button className="button primary full" disabled={game === "build" ? built.length !== sentences[round].answer.length : choice === null} onClick={check}>Comprobar<Icon name="check" size={18}/></button>}</>}</Modal>}</>;
}
