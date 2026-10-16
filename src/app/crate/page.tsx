import { redirect } from "next/navigation";

/** Crate folded into Log; old links keep working. */
export default function CratePage() {
  redirect("/log?filter=kept");
}
