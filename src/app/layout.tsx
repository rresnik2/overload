// ROOT LAYOUT. FROZEN after Phase 0 (change-request protocol). Streams add UI through route-group layouts, not here.
import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { THEME_COLORS, themeInitScript } from "@/lib/theme";
import "@/styles/globals.css";

// Display: Instrument Serif has a single 400 weight (regular + italic): never set it bold.
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

// Body/UI: Newsreader variable (weights 200-800) with its optical-size axis.
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

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
  viewportFit: "cover", // draw into the notch / home-indicator areas; screens pad with env(safe-area-inset-*)
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.paper },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.ink },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script below sets data-theme/color-scheme before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${instrument.variable} ${newsreader.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-base-100 text-base-content">
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
