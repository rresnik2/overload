// ROOT LAYOUT. FROZEN after Phase 0 (change-request protocol). Streams add UI through route-group layouts, not here.
import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";
import { resolveAppUrl } from "@/lib/app-url";
import { THEME_COLORS, themeInitScript } from "@/lib/theme";
import "@/styles/globals.css";
import { ServerTimingProbe } from "./server-timing-probe";
import { WebVitals } from "./web-vitals";

// One family for display and body: Archivo, variable in weight (100-900) and width (wdth 62-125). Display type sets
// font-stretch: 62% with italic 850; body stays at 100%. --font-display and --font-body both resolve to it (theme.css).
const archivo = Archivo({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const appUrl = resolveAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Overload", template: "%s · Overload" },
  description: "Log your lifts and watch weight and reps progress, with forecasts and evidence-based insights.",
  applicationName: "Overload",
  formatDetection: { telephone: false },
  // iPhone home-screen app: standalone, content drawn under a translucent status bar.
  appleWebApp: { capable: true, title: "Overload", statusBarStyle: "black-translucent" },
  // Next emits only the unprefixed `mobile-web-app-capable`; older iOS versions still key off the apple-prefixed tag.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // draw into the notch / home-indicator areas; screens pad with the --sab / --sat tokens (theme.css)
  // Android Chrome: the on-screen keyboard shrinks the layout viewport (like iOS), so a form can scroll above it instead of hiding under it.
  interactiveWidget: "resizes-content",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.paper },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.ink },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script below sets data-theme/color-scheme before React hydrates.
    <html lang="en" suppressHydrationWarning className={archivo.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-base-100 text-base-content">
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
          {children}
        </SerwistProvider>
        <WebVitals />
        {process.env.OVERLOAD_SERVER_TIMING === "1" ? <ServerTimingProbe /> : null}
      </body>
    </html>
  );
}
