import type { Metadata } from "next";
import ProsePage from "@/components/ProsePage";
import GuideContent from "@/components/GuideContent";

export const metadata: Metadata = {
  title: "Using Roots Knotty Roots — User's Guide",
  description:
    "How to use Roots Knotty Roots: searching by artist, title, matrix and label numbers, label, format, country, producer, date, riddim, origin, genre and B-side, plus sorting and browsing.",
};

export default function GuidePage() {
  return (
    <ProsePage title="Using Roots Knotty Roots">
      <GuideContent />
    </ProsePage>
  );
}
