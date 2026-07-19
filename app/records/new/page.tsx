import { redirect } from "next/navigation";
import EditorRecordForm from "@/components/EditorRecordForm";
import { getSession } from "@/lib/auth/requireAdmin";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

export default async function NewRecordPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin");

  const sp = await searchParams;
  const createError = first(sp.createError);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-3xl text-ink mb-1">Add a New Track</h1>
      <p className="font-body text-ink-soft mb-6">
        Fill in what you know. Only the fields you enter are saved. This track
        is attributed to you and preserved across the admin&rsquo;s catalogue
        updates.
      </p>

      {createError === "empty" && (
        <div className="border-2 border-error text-error bg-paper px-4 py-2 font-body mb-4">
          Enter at least an artist or a title.
        </div>
      )}
      {createError === "1" && (
        <div className="border-2 border-error text-error bg-paper px-4 py-2 font-body mb-4">
          Something went wrong creating that track. Please try again.
        </div>
      )}

      <div className="frame-double bg-paper p-5 sm:p-7">
        <EditorRecordForm action="/api/editor/create" values={{}} submitLabel="Create Track" />
      </div>
    </div>
  );
}
