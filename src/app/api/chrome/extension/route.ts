import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";
import { appUrl } from "@/lib/app-url";
import { manifestFor } from "@/lib/chrome-ext";

/**
 * The Chrome extension as a zip, built from the crate-chrome folder on request. Until it is on
 * the Chrome Web Store, a person unzips it and loads it unpacked. The copy built here knows this
 * Crate's address: its pairing script runs on this site, so being signed in on the Crate in
 * Chrome page is all the setup there is. Nothing in it is secret, so no sign-in is needed.
 */
function walk(dir: string, root: string, out: Record<string, Uint8Array>) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, root, out);
    else out[`crate-chrome/${relative(root, p).split("\\").join("/")}`] = new Uint8Array(readFileSync(p));
  }
}

export async function GET() {
  const root = join(process.cwd(), "crate-chrome");
  const files: Record<string, Uint8Array> = {};
  try {
    walk(root, root, files);
  } catch {
    return new Response("The extension files are not on this server.", { status: 404 });
  }
  const manifest = files["crate-chrome/manifest.json"];
  if (manifest) files["crate-chrome/manifest.json"] = new TextEncoder().encode(manifestFor(new TextDecoder().decode(manifest), appUrl()));
  const zip = zipSync(files, { level: 6 });
  return new Response(new Blob([zip as BlobPart]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="crate-chrome.zip"',
      "cache-control": "no-store",
    },
  });
}
