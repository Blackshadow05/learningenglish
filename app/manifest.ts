import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bloom · Aprende inglés",
    short_name: "Bloom",
    description: "Aprende inglés con una experiencia tipo app nativa.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f9f5",
    theme_color: "#f8f9f5",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
