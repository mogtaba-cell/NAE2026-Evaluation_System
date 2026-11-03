"use client";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/ui";

// Old links to one review open it in the "Artworks to be reviewed" workspace.
export default function ReviewLink({ params }) {
  const { id } = use(params); const router = useRouter();
  useEffect(() => { router.replace(`/reviews?status=all&id=${encodeURIComponent(id)}`); }, [id]); // eslint-disable-line
  return <Loading />;
}
