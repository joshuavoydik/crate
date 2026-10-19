import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif, VT323 } from "next/font/google";
import "./globals.css";
import { SWRegister } from "@/components/SWRegister";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";

// Pages do their reading on the server; on a cold start that includes bringing the schema up to date, so give them room.
export const maxDuration = 60;

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const pixel = VT323({ subsets: ["latin"], weight: "400", variable: "--font-pixel", display: "swap" });
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

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
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f3f0e9" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${pixel.variable}`} suppressHydrationWarning>
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
