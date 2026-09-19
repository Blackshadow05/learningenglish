import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-provider";

export const metadata: Metadata = {
  title: {
    default: "Bloom · Tu inglés, a tu manera",
    template: "%s · Bloom",
  },
  description: "Tu espacio para aprender inglés: vocabulario que se queda, conversaciones con IA y pequeños retos a tu ritmo.",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bloom",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#18211c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body><ConvexClientProvider>{children}</ConvexClientProvider></body>
    </html>
  );
}
