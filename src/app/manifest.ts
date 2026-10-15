import type { MetadataRoute } from "next";

// Installed PWAs default to the ink theme (the gym default), so splash/chrome colours are ink; <meta theme-color> follows the active theme.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "Overload",
    short_name: "Overload",
    description: "Log your lifts and watch weight and reps progress, with forecasts and evidence-based insights.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1C1B19",
    theme_color: "#1C1B19",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Start workout", short_name: "Workout", url: "/workout", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
