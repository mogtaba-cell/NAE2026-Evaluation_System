"use client";
import { PageHead } from "@/components/ui";
import Insights from "@/components/Insights";

export default function InsightsPage() {
  return <>
    <PageHead title="Insights" sub="Live numbers for NAE 2026: progress by pathway, results, reviews, artworks and participation. Pick a pathway to narrow every chart." />
    <Insights />
  </>;
}
