import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import Shell from "@/components/Shell";

export default async function AppLayout({ children }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  return <Shell session={session}>{children}</Shell>;
}
