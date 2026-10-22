import { redirect } from "next/navigation";

/** Crate folded into your history; old links keep working. */
export default function CratePage() {
  redirect("/history?filter=kept");
}
