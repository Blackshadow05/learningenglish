"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Inicio" },
  { href: "/search", label: "Buscar" },
  { href: "/notifications", label: "Avisos" },
  { href: "/profile", label: "Perfil" },
] as const;

type TabHref = (typeof items)[number]["href"];

function isActive(pathname: string, href: TabHref) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabIcon({ name }: { name: TabHref }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "/") {
    return (
      <svg {...common} aria-hidden>
        <path d="M3 10.75 12 3.5l9 7.25" />
        <path d="M5.5 9.5v11h13v-11" />
      </svg>
    );
  }

  if (name === "/search") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }

  if (name === "/notifications") {
    return (
      <svg {...common} aria-hidden>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-black/10 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-white/10">
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={true}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-transform duration-150 ease-out active:scale-[0.96] ${
                  active ? "text-foreground" : "text-foreground/50"
                }`}
              >
                <TabIcon name={item.href} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
