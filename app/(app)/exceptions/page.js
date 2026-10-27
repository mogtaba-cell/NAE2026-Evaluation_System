import { redirect } from "next/navigation";
// Exceptions are a tab of Artwork logistics now.
export default function Exceptions() { redirect("/logistics?tab=exceptions"); }
