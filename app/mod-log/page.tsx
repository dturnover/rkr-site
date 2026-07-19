import Link from "next/link";
import { redirect } from "next/navigation";
import Pagination from "@/components/Pagination";
import { getSession } from "@/lib/auth/requireAdmin";
import { getGlobalLog } from "@/lib/editor/overlay";
import { parsePage } from "@/lib/queries/shared";
import { toURLSearchParams, first, type RawSearchParams } from "@/lib/searchParamsUtil";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default async function ModLogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin");

  const sp = await searchParams;
  const page = parsePage(first(sp.page));
  const { entries, total } = await getGlobalLog(page);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-1">Modification Log</h1>
      <p className="font-body text-ink-soft mb-6">
        {total.toLocaleString()} change{total === 1 ? "" : "s"} across the catalogue.
      </p>

      {entries.length === 0 ? (
        <p className="font-body italic text-ink-soft py-8">No changes recorded yet.</p>
      ) : (
        <>
          <Pagination page={page} total={total} searchParams={toURLSearchParams(sp)} position="top" />
          <div className="overflow-x-auto border border-paper-stain">
            <table className="w-full min-w-[720px] text-sm bg-paper">
              <thead>
                <tr className="bg-parchment-deep border-b-2 border-frame text-left font-body font-semibold">
                  <th className="px-3 py-2 whitespace-nowrap">When</th>
                  <th className="px-3 py-2">Change</th>
                  <th className="px-3 py-2 whitespace-nowrap">Editor</th>
                  <th className="px-3 py-2 whitespace-nowrap">Record</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className={`border-b border-paper-stain/60 ${i % 2 === 1 ? "bg-parchment/30" : ""}`}>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-ink-soft">
                      {formatWhen(e.created_at)}
                    </td>
                    <td className="px-3 py-2 align-top font-body break-words">
                      {e.action === "new" ? (
                        <span className="text-rasta-green">Created record</span>
                      ) : e.action === "modified" ? (
                        <span className="text-ink">
                          <span className="text-ink-soft">{e.field}:</span>{" "}
                          {e.old_value ? `“${e.old_value}”` : "(blank)"} →{" "}
                          {e.new_value ? `“${e.new_value}”` : "(blank)"}
                        </span>
                      ) : (
                        <span className="text-ink">{e.action}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-ink">{e.editor_name}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      {e.record_id != null && (
                        <Link href={`/records/${e.record_id}`} className="text-link hover:text-rasta-red">
                          #{e.record_id}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} searchParams={toURLSearchParams(sp)} />
        </>
      )}
    </div>
  );
}
