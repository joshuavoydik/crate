import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Mono, Doto } from "next/font/google";
import "./globals.css";
import "./instrument.css";
import { SWRegister } from "@/components/SWRegister";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";

// Pages do their reading on the server; on a cold start that includes bringing the schema up to date, so give them room.
export const maxDuration = 60;

// Direction A, "Instrument": one grotesk for everything you read, a mono for labels, a dot matrix for every number.
const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
const num = Doto({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-num", display: "swap" });

export const metadata: Metadata = {
  title: "Crate",
  description: "Music between friends, with memory.",
  manifest: "/manifest.webmanifest",
  applicationName: "Crate",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Crate" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
    { media: "(prefers-color-scheme: light)", color: "#0b0b0c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${num.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
