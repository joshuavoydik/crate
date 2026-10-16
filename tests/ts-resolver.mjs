import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const SRC = pathToFileURL(resolvePath(fileURLToPath(import.meta.url), "../../src/")).href;

function withExt(href) {
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    const candidate = href + ext;
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const href = SRC + specifier.slice(2);
    return next(withExt(href) ?? href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
    const href = new URL(specifier, context.parentURL).href;
    const found = withExt(href);
    if (found) return next(found, context);
  }
  return next(specifier, context);
}
