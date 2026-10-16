import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

/**
 * The Chrome extension as a zip, built from the crate-chrome folder on request. Until it is on
 * the Chrome Web Store, a person unzips it and loads it unpacked; the pair page then binds it
 * to their Crate. Nothing in it is secret, so no sign-in is needed.
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
  const zip = zipSync(files, { level: 6 });
  return new Response(new Blob([zip as BlobPart]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="crate-chrome.zip"',
      "cache-control": "public, max-age=300",
    },
  });
}
