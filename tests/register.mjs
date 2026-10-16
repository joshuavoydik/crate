// Lets Node's built-in type stripping run the app's TypeScript directly in tests:
// resolves extensionless relative imports and the "@/..." alias to src/.
import { register } from "node:module";
register("./ts-resolver.mjs", import.meta.url);
