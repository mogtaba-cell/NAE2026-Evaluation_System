import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { HOME } from "@/components/nav";

export default async function Home() {
  const s = await getServerSession();
  if (!s) redirect("/login");
  redirect(HOME[s.role] || "/dashboard");
}
