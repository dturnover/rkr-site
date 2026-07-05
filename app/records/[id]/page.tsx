import { notFound } from "next/navigation";
import TrackDetailCard from "@/components/TrackDetailCard";
import { getRecordById } from "@/lib/queries/records";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recordId = parseInt(id, 10);
  if (!Number.isFinite(recordId)) notFound();

  const record = await getRecordById(recordId);
  if (!record) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <TrackDetailCard record={record} />
    </div>
  );
}
