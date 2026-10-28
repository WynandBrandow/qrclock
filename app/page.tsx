import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { homeFor } from "@/lib/nav";

export default async function Home() {
  const v = await getViewer();
  redirect(v ? homeFor(v.role) : "/login");
}
