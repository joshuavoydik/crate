import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { appUrl } from "./app-url";

/**
 * The card a link unfurls into, on X or in Messages: black ground, the cover large, the name in the
 * grotesk, a mono line underneath, and the signal red where the page is live. One renderer for a
 * person, a playlist and a station, so they read as one family.
 */

export const OG_SIZE = { width: 1200, height: 630 };

let fonts: Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 500; style: "normal" }>> | null = null;

/**
 * A font file beside this module. The build traces the `new URL(…, import.meta.url)` reference and
 * ships the file with the server, so it is read from disk where the source tree lives; the emitted
 * static copy is the fallback, and the app's own address the last resort.
 */
async function asset(name: string, ref: URL | string): Promise<ArrayBuffer> {
  const tries: Array<() => Promise<Buffer | ArrayBuffer>> = [
    () => readFile(join(process.cwd(), "src", "lib", "og-fonts", name)),
    () => readFile(join(process.cwd(), ".next", "server", "chunks", String(ref).replace(/^\/_next\//, ""))),
    async () => {
      const s = String(ref);
      if (s.startsWith("file:")) return readFile(fileURLToPath(s));
      const r = await fetch(s.startsWith("http") ? s : `${appUrl()}${s}`);
      if (!r.ok) throw new Error(`Font not found at ${s}`);
      return r.arrayBuffer();
    },
  ];
  let last: unknown;
  for (const t of tries) {
    try {
      const b = await t();
      return b instanceof ArrayBuffer ? b : (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(`Font ${name} not found`);
}

function loadFonts() {
  if (!fonts) {
    fonts = Promise.all([
      asset("SpaceGrotesk-Medium.woff", new URL("./og-fonts/SpaceGrotesk-Medium.woff", import.meta.url)),
      asset("IBMPlexMono-Regular.woff", new URL("./og-fonts/IBMPlexMono-Regular.woff", import.meta.url)),
    ]).then(([grotesk, mono]) => [
      { name: "Grotesk", data: grotesk, weight: 500 as const, style: "normal" as const },
      { name: "Mono", data: mono, weight: 400 as const, style: "normal" as const },
    ]);
  }
  return fonts;
}

export type Card = {
  /** The small mono line above the name: "JOSHUA ON CRATE", "A PLAYLIST FROM NIGHT SHIFT". */
  kicker: string;
  title: string;
  /** Under the title: the song playing, a count, a crew. */
  line: string | null;
  /** Up to four covers; one is shown large, four as a grid. */
  covers: string[];
  /** Red beacon and "playing now" when true. */
  live?: boolean;
};

export async function card(c: Card): Promise<ImageResponse> {
  const fontList = await loadFonts();
  const covers = [...new Set(c.covers.filter(Boolean))].slice(0, 4);
  const title = c.title.length > 44 ? `${c.title.slice(0, 42)}…` : c.title;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0b0b0c",
          color: "#eceae4",
          fontFamily: "Grotesk",
          padding: 64,
          position: "relative",
        }}
      >
        {/* corner marks */}
        <div style={{ position: "absolute", top: 40, left: 40, width: 28, height: 28, borderTop: "3px solid #ff4d2e", borderLeft: "3px solid #ff4d2e" }} />
        <div style={{ position: "absolute", bottom: 40, right: 40, width: 28, height: 28, borderBottom: "3px solid #ff4d2e", borderRight: "3px solid #ff4d2e" }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, minWidth: 0, paddingRight: 48 }}>
          <div style={{ display: "flex", alignItems: "center", fontFamily: "Mono", fontSize: 24, letterSpacing: 4, color: "#9a9890" }}>
            {c.live && <div style={{ width: 14, height: 14, background: "#ff4d2e", marginRight: 16 }} />}
            {c.kicker.toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: title.length > 24 ? 72 : 96, lineHeight: 1, letterSpacing: -3, marginBottom: 24 }}>{title}</div>
            {c.line && (
              <div style={{ fontFamily: "Mono", fontSize: 26, color: "#b5b3ac", letterSpacing: 1 }}>{c.line.length > 60 ? `${c.line.slice(0, 58)}…` : c.line}</div>
            )}
          </div>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 22, letterSpacing: 6, color: "#ff4d2e" }}>CRATE</div>
        </div>

        <div style={{ display: "flex", width: 440, height: 440, alignSelf: "center", flexShrink: 0, background: "#1c1c1f", position: "relative" }}>
          {covers.length >= 4 ? (
            <div style={{ display: "flex", flexWrap: "wrap", width: 440, height: 440 }}>
              {covers.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt="" width={220} height={220} style={{ objectFit: "cover" }} />
              ))}
            </div>
          ) : covers[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={covers[0]} alt="" width={440} height={440} style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: 440, height: 440, alignItems: "center", justifyContent: "center", fontFamily: "Mono", fontSize: 28, color: "#3a3a3e", letterSpacing: 6 }}>
              CRATE
            </div>
          )}
          <div style={{ position: "absolute", top: -10, left: -10, width: 28, height: 28, borderTop: "3px solid #ff4d2e", borderLeft: "3px solid #ff4d2e" }} />
          <div style={{ position: "absolute", bottom: -10, right: -10, width: 28, height: 28, borderBottom: "3px solid #ff4d2e", borderRight: "3px solid #ff4d2e" }} />
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: fontList },
  );
}
