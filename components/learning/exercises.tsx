"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { Modal, useLearning } from "./learning-provider";
import type { FraseDia, Word } from "./demo-data";

type Game = "match" | "build" | "choose";
type BuildToken = { id: string; text: string };
type BuildRound = { translation: string; answer: string[]; tokens: BuildToken[] };

function seleccionarPractica(vocabulary: Word[], cantidad: number): Word[] {
  const ordenadas = [...vocabulary].sort((a, b) => a.mastery - b.mastery);
  const elegidas: Word[] = [];
  for (const word of ordenadas) {
    if (elegidas.length === cantidad) break;
    if (elegidas.some(item => item.translation === word.translation || item.word === word.word)) continue;
    elegidas.push(word);
  }
  for (const word of ordenadas) {
    if (elegidas.length === cantidad) break;
    if (!elegidas.some(item => item.id === word.id)) elegidas.push(word);
  }
  return elegidas;
}

function prepararRondas(frases: FraseDia[]): BuildRound[] {
  return frases.slice(0, 3).map((frase, index) => {
    const answer = frase.textoIngles.split(" ");
    const offset = answer.length > 1 ? (index % (answer.length - 1)) + 1 : 0;
    const orden = [...answer.slice(offset), ...answer.slice(0, offset)];
    return { translation: frase.traduccionEspanol, answer, tokens: orden.map((text, position) => ({ id: `${index}-${position}`, text })) };
  });
}

export function Exercises() {
  const { vocabulary, frases, planCargando, recordExercise, exerciseScore } = useLearning();
  const [game, setGame] = useState<Game | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [left, setLeft] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [round, setRound] = useState(0);
  const [built, setBuilt] = useState<BuildToken[]>([]);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [complete, setComplete] = useState(false);
  const [points, setPoints] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const practiceWords = seleccionarPractica(vocabulary, 4);
  const translations = [practiceWords[2], practiceWords[0], practiceWords[3], practiceWords[1]];
  const buildRounds = prepararRondas(frases);
  const matchListo = practiceWords.length === 4;
  const buildListo = buildRounds.length > 0;
  function start(type: Game) { setGame(type); setMatched([]); setLeft(null); setFeedback(""); setRound(0); setBuilt([]); setChecked(false); setComplete(false); setPoints(0); setChoice(null); }
  function finish(score: number) { setComplete(true); recordExercise(score); }
  function match(id: string) {
    if (left === null) { setFeedback("Primero elige una expresión en inglés."); return; }
    if (left === id) { const next = [...matched, id]; setMatched(next); setPoints(points + 10); setFeedback("¡Eso es! Una conexión más."); if (next.length === 4) finish(points + 10); }
    else setFeedback("Casi. Busca otro significado para esa expresión.");
    setLeft(null);
  }
  function totalRondas() { return game === "build" ? buildRounds.length : 3; }
  function check() {
    const isCorrect = game === "build" ? built.map(token => token.text).join(" ") === buildRounds[round].answer.join(" ") : choice === practiceWords[round].id;
    setCorrect(isCorrect); setChecked(true); if (isCorrect) setPoints(points + 10);
  }
  function next() { if (round >= totalRondas() - 1) { finish(points); return; } setRound(round + 1); setBuilt([]); setChecked(false); setChoice(null); }
  if (planCargando) return <p className="loading-message">Preparando tus retos…</p>;
  return <>
    <section className="page-heading">
      <div className="eyebrow">APRENDER TAMBIÉN ES JUGAR</div>
      <h1>Un reto pequeño.<br/>Un gran «ya sé»<span className="orange-text">.</span></h1>
      <p>Haz tuyas las palabras, una partida a la vez.</p>
    </section>
    <div className="play-banner">
      <div><span className="tiny-tag">TU PRÓXIMO PEQUEÑO LOGRO</span><h2>Lo sabes más<br/>de lo que crees.</h2><p>Vamos a comprobarlo.</p></div>
      <div className="play-blocks" aria-hidden="true"><span>A</span><span>✦</span><span>+</span></div>
    </div>
    <div className="section-heading"><h2>Elige tu reto</h2><span className="tag orange-tag">{exerciseScore} puntos</span></div>
    <div className="game-list">
      <button className="game-option" disabled={!matchListo} onClick={() => start("match")}>
        <span className="game-illustration match-illustration"><i>A</i><i>á</i></span>
        <span><strong>Conecta las palabras</strong><small>Cada palabra tiene su otra mitad.</small><em>4 parejas · 2 min</em></span>
        <Icon name="chevron" size={20}/>
      </button>
      <button className="game-option" disabled={!buildListo} onClick={() => start("build")}>
        <span className="game-illustration build-illustration"><i>abc</i></span>
        <span><strong>Dale forma a la frase</strong><small>Unas piezas, muchas posibilidades.</small><em>3 frases · 3 min</em></span>
        <Icon name="chevron" size={20}/>
      </button>
      <button className="game-option" disabled={!matchListo} onClick={() => start("choose")}>
        <span className="game-illustration choose-illustration"><Icon name="target" size={34}/></span>
        <span><strong>Encuentra el significado</strong><small>Confía en lo que estás aprendiendo.</small><em>3 preguntas · 2 min</em></span>
        <Icon name="chevron" size={20}/>
      </button>
    </div>
    <div className="soft-note"><Icon name="sparkles"/><span>Los retos de vocabulario usan las palabras y frases de tu plan de hoy. Repetir también es avanzar.</span></div>
    {game && <Modal title={game === "match" ? "Conecta las palabras" : game === "build" ? "Dale forma a la frase" : "Encuentra el significado"} onClose={() => setGame(null)}>
      {complete ? <div className="completion">
        <div className="celebration-star">✦</div>
        <span className="tag">+{points} puntos</span>
        <h2>¡Una partida más cerca!</h2>
        <p>{points > 0 ? "Las palabras empiezan a sentirse más tuyas." : "Equivocarte también es parte de aprender. Puedes intentarlo otra vez."}</p>
        <button className="button primary full" onClick={() => start(game)}>Volver a jugar<Icon name="repeat" size={18}/></button>
        <button className="text-button skip" onClick={() => setGame(null)}>Ver otros retos</button>
      </div> : game === "match" ? <>
        <div className="flex-between"><p className="muted">Toca una expresión y su significado.</p><span className="tag">{matched.length}/4</span></div>
        <div className="matching-grid">
          <div>{practiceWords.map(word => <button key={word.id} disabled={matched.includes(word.id)} className={`${left === word.id ? "selected" : ""} ${matched.includes(word.id) ? "matched" : ""}`} onClick={() => { setLeft(word.id); setFeedback(""); }}>{matched.includes(word.id) && <Icon name="check" size={16}/>}<span lang="en">{word.word}</span></button>)}</div>
          <div>{translations.map(word => <button key={word.id} disabled={matched.includes(word.id)} className={matched.includes(word.id) ? "matched" : ""} onClick={() => match(word.id)}>{matched.includes(word.id) && <Icon name="check" size={16}/>}<span>{word.translation}</span></button>)}</div>
        </div>
        <p className="game-feedback" role="status">{feedback || "Cada conexión es un pequeño logro."}</p>
      </> : <>
        <div className="flex-between"><span className="tag">Reto {round + 1} de {totalRondas()}</span><span className="muted">{points} puntos</span></div>
        <div className="progress-track assessment-track"><i style={{ width: `${round / totalRondas() * 100}%` }}/></div>
        {game === "build" ? <>
          <p className="eyebrow">ORDENA LA FRASE EN INGLÉS</p>
          <h2 className="game-question">{buildRounds[round].translation}</h2>
          <div className="sentence-drop" aria-label="Tu frase">
            {built.length ? built.map((token, index) => <button key={token.id} disabled={checked} onClick={() => setBuilt(built.filter((_, i) => i !== index))}>{token.text}<Icon name="close" size={12}/></button>) : <span>Toca las palabras para construirla</span>}
          </div>
          <div className="token-bank">{buildRounds[round].tokens.map(token => <button key={token.id} disabled={built.some(item => item.id === token.id) || checked} onClick={() => setBuilt([...built, token])}>{token.text}</button>)}</div>
        </> : <>
          <p className="eyebrow">¿QUÉ SIGNIFICA ESTA EXPRESIÓN?</p>
          <h2 className="game-question" lang="en">{practiceWords[round].word}</h2>
          <div className="answer-list">{translations.map(word => <button key={word.id} disabled={checked} className={`answer-option ${choice === word.id ? "selected" : ""} ${checked && word.id === practiceWords[round].id ? "correct-answer" : ""}`} onClick={() => setChoice(word.id)}>{word.translation}{choice === word.id && <Icon name="check" size={18}/>}</button>)}</div>
        </>}
        {checked ? <>
          <div className={`answer-feedback ${correct ? "is-correct" : "is-wrong"}`} role="status">
            <Icon name={correct ? "check" : "help"}/>
            <div><strong>{correct ? "¡Así se dice!" : "Casi. Mira cómo se dice:"}</strong>{!correct && <p>{game === "build" ? buildRounds[round].answer.join(" ") : practiceWords[round].translation}</p>}</div>
          </div>
          <button className="button primary full" onClick={next}>{round >= totalRondas() - 1 ? "Ver resultado" : "Siguiente reto"}<Icon name="arrow" size={18}/></button>
        </> : <button className="button primary full" disabled={game === "build" ? built.length !== buildRounds[round].answer.length : choice === null} onClick={check}>Comprobar<Icon name="check" size={18}/></button>}
      </>}
    </Modal>}
  </>;
}
