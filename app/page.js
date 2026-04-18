import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default async function HomePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  return <AppShell session={session} />;
}
