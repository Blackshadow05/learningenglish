"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Icon } from "./icons";
import { diasAnteriores, formatoDolares, NOMBRES_CONCEPTO, NOMBRES_PROVEEDOR, type ConceptoGasto } from "../../lib/api-costs";
import { fechaLocal } from "../../lib/learning-memory";
import { NOMBRES_MODO, type ModoPractica } from "../../lib/practice-config";
import styles from "./costs.module.css";

const DIAS = 7;
const FUERA_DE_SESION: ConceptoGasto[] = ["plan", "eleccion_voz"];

type Partida = { concepto: ConceptoGasto; modelo: string; costo: number; llamadas: number };

function etiquetaDia(fecha: string, hoy: string) {
  if (fecha === hoy) return "Hoy";
  if (fecha === diasAnteriores(hoy, 2)[1]) return "Ayer";
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}

function duracion(segundos: number) {
  const total = Math.round(segundos);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} min`;
}

function nombreModo(modo: string) {
  return modo in NOMBRES_MODO ? NOMBRES_MODO[modo as ModoPractica] : "";
}

function Partidas({ partidas }: { partidas: Partida[] }) {
  return <div className={styles.breakdown}>
    {partidas.map(partida => <div key={`${partida.concepto}-${partida.modelo}`}>
      <span>{NOMBRES_CONCEPTO[partida.concepto]}<small>{partida.modelo}{partida.llamadas > 1 ? ` · ${partida.llamadas} llamadas` : ""}</small></span>
      <strong>{formatoDolares(partida.costo)}</strong>
    </div>)}
  </div>;
}

export function Gastos() {
  const [hoy, setHoy] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  useEffect(() => {
    const espera = setTimeout(() => setHoy(fechaLocal()), 0);
    return () => clearTimeout(espera);
  }, []);
  const dias = hoy ? diasAnteriores(hoy, DIAS) : [];
  const resumen = useQuery(api.gastos.resumenDias, hoy ? { fechas: dias } : "skip");
  const fecha = seleccion ?? hoy;
  const detalle = useQuery(api.gastos.sesionesDelDia, fecha ? { fecha } : "skip");
  if (!hoy || !fecha || !resumen) return <p className="loading-message">Calculando tus gastos…</p>;

  const total = resumen.reduce((suma, dia) => suma + dia.total, 0);
  const sesiones = resumen.reduce((suma, dia) => suma + dia.sesiones, 0);
  const deSesiones = resumen.reduce((suma, dia) => suma + dia.partidas.filter(partida => !FUERA_DE_SESION.includes(partida.concepto)).reduce((parcial, partida) => parcial + partida.costo, 0), 0);
  const maximo = Math.max(...resumen.map(dia => dia.total), 0.0001);
  const elegido = resumen.find(dia => dia.fecha === fecha);

  return <>
    <section className="page-heading">
      <div className="eyebrow">CONTROL DE GASTOS</div>
      <h1>Lo que cuesta<br/>practicar<span className="green-text">.</span></h1>
      <p>Cada sesión y cada día, estimado con los precios de OpenAI y Google.</p>
    </section>
    <div className={styles.summary}>
      <div><strong>{formatoDolares(resumen.find(dia => dia.fecha === hoy)?.total ?? 0)}</strong><span>hoy</span></div>
      <div><strong>{formatoDolares(total)}</strong><span>últimos {DIAS} días</span></div>
      <div><strong>{formatoDolares(sesiones ? deSesiones / sesiones : 0)}</strong><span>por sesión</span></div>
    </div>

    <div className="section-heading"><h2>Por día</h2><span className="section-caption">Toca un día para ver el detalle</span></div>
    <div className={styles.days}>
      {resumen.map(dia => <button key={dia.fecha} className={styles.day} aria-pressed={dia.fecha === fecha} onClick={() => { setSeleccion(dia.fecha); setAbierta(null); }}>
        <span className={styles.dayLabel}>{etiquetaDia(dia.fecha, hoy)}</span>
        <span className={styles.bar} aria-hidden="true"><i style={{ width: `${(dia.total / maximo) * 100}%` }}/></span>
        <span className={styles.dayTotal}><strong>{formatoDolares(dia.total)}</strong><small>{dia.sesiones} {dia.sesiones === 1 ? "sesión" : "sesiones"}</small></span>
      </button>)}
    </div>
    {elegido && elegido.partidas.length > 0 && <>
      <p className={styles.subheading}>EN QUÉ SE FUE · {etiquetaDia(fecha, hoy).toUpperCase()}</p>
      <Partidas partidas={elegido.partidas}/>
    </>}

    <div className={`section-heading ${styles.sessionsHeading}`}><h2>Sesiones · {etiquetaDia(fecha, hoy)}</h2><span className="section-caption">{detalle?.sesiones.length ?? 0}</span></div>
    {detalle === undefined ? <p className={styles.empty}>Cargando sesiones…</p>
      : !detalle.sesiones.length ? <p className={styles.empty}>No hubo sesiones de voz este día.</p>
        : <div className={styles.sessions}>
          {detalle.sesiones.map(sesion => <article key={sesion.sesionId} className={styles.session}>
            <button className={styles.sessionHead} aria-expanded={abierta === sesion.sesionId} onClick={() => setAbierta(abierta === sesion.sesionId ? null : sesion.sesionId)}>
              <span className={styles.sessionIcon}><Icon name="mic" size={18}/></span>
              <span className={styles.sessionInfo}>
                <strong>{sesion.proveedor ? NOMBRES_PROVEEDOR[sesion.proveedor] : "Sesión sin cerrar"}</strong>
                <small>{[
                  sesion.inicio ? new Date(sesion.inicio).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "",
                  sesion.duracionSegundos ? duracion(sesion.duracionSegundos) : "",
                  nombreModo(sesion.modo),
                  sesion.tema,
                ].filter(Boolean).join(" · ")}</small>
              </span>
              <strong className={styles.sessionTotal}>{formatoDolares(sesion.total)}</strong>
              <Icon name="chevron" size={15} className={styles.chevron}/>
            </button>
            {abierta === sesion.sesionId && (sesion.partidas.length ? <Partidas partidas={sesion.partidas}/> : <p className={styles.empty}>Sin consumo registrado.</p>)}
          </article>)}
        </div>}
    {detalle && detalle.otros.length > 0 && <>
      <p className={styles.subheading}>FUERA DE LAS SESIONES</p>
      <Partidas partidas={detalle.otros}/>
    </>}
    <div className="soft-note"><Icon name="leaf"/><span>Son estimaciones con los precios públicos de cada modelo. El panel de OpenAI agrupa los gastos por día UTC y aquí ves tu día local, así que puede haber pequeñas diferencias. Gemini no cobra si usas su nivel gratuito.</span></div>
  </>;
}
