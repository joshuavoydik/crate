import { redirect } from "next/navigation";

/** The Log is the crew's stream now, at the root; the private list this page used to be lives under You. */
export default async function LogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : null;
  redirect(filter ? `/history?filter=${encodeURIComponent(filter)}` : "/");
}
