import PageSkeleton from "@/components/PageSkeleton";

// Covers /browse and everything under it (the facet indexes and each facet
// value's results), so stepping through letters or facets responds instantly.
export default function Loading() {
  return <PageSkeleton />;
}
