"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "./icons";
import { LearningProvider, useLearning } from "./learning-provider";
import { Onboarding, Preferences } from "./onboarding";

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Hoy", icon: "home" }, { href: "/vocabulary", label: "Palabras", icon: "book" }, { href: "/practice", label: "Conversar", icon: "mic" }, { href: "/exercises", label: "Jugar", icon: "game" }, { href: "/progress", label: "Progreso", icon: "chart" },
];
function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { level, assessmentOpen, setAssessmentOpen } = useLearning();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  return <div className="app-frame"><a href="#main-content" className="skip-link">Saltar al contenido</a><header className="topbar"><Link href="/" className="brand" aria-label="Bloom, inicio"><span className="brand-mark"><i/><i/><i/><i/></span>bloom<span className="brand-dot">.</span></Link><div className="topbar-actions"><button className="level-pill" onClick={() => setAssessmentOpen(true)}><Icon name="sparkles" size={15}/>{level ? `Nivel ${level}` : "Tu nivel"}</button><button className="avatar" aria-label="Personalizar mi aprendizaje" onClick={() => setPreferencesOpen(true)}>E</button></div></header><main id="main-content" className="page-content" key={pathname}>{children}<footer className="page-footer"><span className="preview-label"><span/>Prototipo interactivo</span><span>Datos de ejemplo · solo esta sesión</span></footer></main><nav className="mobile-nav" aria-label="Navegación principal">{navigation.map(item => <Link key={item.href} href={item.href} aria-label={item.label} aria-current={pathname === item.href ? "page" : undefined} className={pathname === item.href ? "active" : ""}><span className="tab-icon"><Icon name={item.icon} size={22}/></span><span>{item.label}</span></Link>)}</nav>{assessmentOpen && <Onboarding/>}{preferencesOpen && <Preferences onClose={() => setPreferencesOpen(false)}/>}</div>;
}
export function AppShell({ children }: { children: React.ReactNode }) { return <LearningProvider><Shell>{children}</Shell></LearningProvider>; }
