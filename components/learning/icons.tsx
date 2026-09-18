import type { CSSProperties } from "react";

export type IconName = "home" | "book" | "mic" | "game" | "chart" | "settings" | "arrow" | "chevron" | "sparkles" | "flame" | "clock" | "check" | "close" | "volume" | "search" | "plus" | "globe" | "briefcase" | "coffee" | "headphones" | "repeat" | "target" | "send" | "pause" | "leaf" | "help" | "logout";
const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v12h5v-7h4v7h5V9"/></>,
  book: <><path d="M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a5 5 0 0 0-4 2 5 5 0 0 0-4-2H3Z"/></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
  game: <><path d="M7 7h10c3 0 5 10 3 12-2 2-5-3-5-3H9s-3 5-5 3C2 17 4 7 7 7Z"/><path d="M8 10v5m-2.5-2.5h5M16 11h.01M18 14h.01"/></>,
  chart: <><path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/></>,
  settings: <><path d="m10 3-.6 2.2-2 .9L5.2 5 3 9l1.8 1.5v3L3 15l2.2 4 2.2-1.1 2 .9L10 21h4l.6-2.2 2-.9 2.2 1.1 2.2-4-1.8-1.5v-3L21 9l-2.2-4-2.2 1.1-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/></>,
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/></>,
  flame: <path d="M13 2c1 5-5 7-3 11 1-1 2-2 3-4 4 3 7 7 4 11-3 4-11 2-12-3C4 11 10 7 13 2Z"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  volume: <><path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  search: <><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c5 4 13 4 18 0m-9 1v4"/></>,
  coffee: <><path d="M4 8h12v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M6 2v2m4-2v2m4-2v2"/></>,
  headphones: <><path d="M3 13v-2a9 9 0 0 1 18 0v2"/><rect x="3" y="11" width="4" height="9" rx="2"/><rect x="17" y="11" width="4" height="9" rx="2"/></>,
  repeat: <><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  send: <><path d="m3 3 19 9-19 9 4-9Zm4 9h15"/></>,
  pause: <><path d="M8 5v14M16 5v14"/></>,
  leaf: <><path d="M20 3C7 1 1 12 7 17S23 13 20 3ZM4 21 15 10"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/></>,
  logout: <><path d="M9 3H3v18h6m6-15 6 6-6 6M9 12h12"/></>,
};
export function Icon({ name, size = 20, className = "", style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}
