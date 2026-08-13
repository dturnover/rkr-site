import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Pagination from "@/components/Pagination";
import { getSession } from "@/lib/auth/requireAdmin";
import { getGlobalLog, parseLogFilter, type GlobalLogEntry, type LogFilter } from "@/lib/editor/overlay";
import { parsePage } from "@/lib/queries/shared";
import { toURLSearchParams, first, type RawSearchParams } from "@/lib/searchParamsUtil";

// Editor-only page: names and edit history should never be search-indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// The review filters are the compiler's own workflow; an editor only cares
// which changes came back with a note on them.
const ADMIN_FILTERS: { key: LogFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unreviewed", label: "Not yet reviewed" },
  { key: "reviewed", label: "Reviewed" },
  { key: "noted", label: "With a note" },
];
const EDITOR_FILTERS: { key: LogFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "noted", label: "With a note" },
];

function ChangeCell({ e }: { e: GlobalLogEntry }) {
  if (e.action === "new") return <span className="text-rasta-green">Created record</span>;
  if (e.action === "deleted")
    return (
      <span className="text-error">Deleted record{e.old_value ? ` (${e.old_value})` : ""}</span>
    );
  if (e.action === "restored") return <span className="text-ink">Restored record</span>;
  if (e.action === "modified" || e.action === "reverted")
    return (
      <span className="text-ink">
        <span className="text-ink-soft">{e.field}:</span>{" "}
        {e.old_value ? `“${e.old_value}”` : "(blank)"} →{" "}
        {e.new_value ? `“${e.new_value}”` : "(blank)"}
      </span>
    );
  return <span className="text-ink">{e.action}</span>;
}

export default async function ModLogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin");
  const isAdmin = session.role === "admin";

  const sp = await searchParams;
  const page = parsePage(first(sp.page));
  const filter = parseLogFilter(first(sp.filter));
  const { entries, total, unreviewed } = await getGlobalLog(page, filter);

  // Round-trip the current view so ticking a box or saving a note returns to
  // the same page and filter rather than dumping the compiler back at the top.
  const backParams = toURLSearchParams(sp);
  const back = `/mod-log${backParams.toString() ? `?${backParams}` : ""}`;

  const filterHref = (key: LogFilter) => {
    const params = toURLSearchParams(sp);
    params.delete("page"); // a new filter starts at page 1
    if (key === "all") params.delete("filter");
    else params.set("filter", key);
    return `/mod-log${params.toString() ? `?${params}` : ""}`;
  };

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-1">Modification Log</h1>
      <p className="font-body text-ink-soft mb-4">
        {total.toLocaleString()} change{total === 1 ? "" : "s"}
        {filter !== "all" ? " in this view" : " across the catalogue"}
        {isAdmin && unreviewed > 0 && (
          <>
            {" "}
            &middot;{" "}
            <span className="text-rasta-red">{unreviewed.toLocaleString()} not yet reviewed</span>
          </>
        )}
        .
      </p>

      <div className="flex flex-wrap gap-2 mb-5 font-body text-sm">
        {(isAdmin ? ADMIN_FILTERS : EDITOR_FILTERS).map((f) => (
            <Link
              key={f.key}
              href={filterHref(f.key)}
              className={`px-3 py-1 border ${
                filter === f.key
                  ? "border-frame bg-frame text-paper"
                  : "border-paper-stain text-ink hover:bg-parchment-deep"
              }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="font-body italic text-ink-soft py-8">
          {filter === "unreviewed"
            ? "Nothing left to review — every change has been checked."
            : filter === "noted"
              ? "No notes have been left on any changes."
              : "No changes recorded yet."}
        </p>
      ) : (
        <>
          <Pagination page={page} total={total} searchParams={backParams} position="top" />
          <div className="overflow-x-auto border border-paper-stain">
            <table className="w-full min-w-[820px] text-sm bg-paper">
              <thead>
                <tr className="bg-parchment-deep border-b-2 border-frame text-left font-body font-semibold">
                  {isAdmin && <th className="px-3 py-2 whitespace-nowrap">Done</th>}
                  <th className="px-3 py-2 whitespace-nowrap">When</th>
                  <th className="px-3 py-2">Change</th>
                  <th className="px-3 py-2 whitespace-nowrap">Editor</th>
                  <th className="px-3 py-2 whitespace-nowrap">Record</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const reviewed = !!e.reviewed_at;
                  const recordId = e.live_record_id;
                  return (
                    <tr
                      key={e.id}
                      className={`border-b border-paper-stain/60 ${
                        e.note
                          ? "bg-rasta-gold/10"
                          : reviewed
                            ? "bg-rasta-green/5"
                            : ""
                      }`}
                    >
                      {isAdmin && (
                        <td className="px-3 py-2 align-top">
                          {/* A one-click form rather than a live checkbox: this
                              page has no client JS, so the tick has to post. */}
                          <form action="/api/mod-log" method="POST">
                            <input type="hidden" name="action" value="review" />
                            <input type="hidden" name="logId" value={e.id} />
                            <input type="hidden" name="reviewed" value={reviewed ? "0" : "1"} />
                            <input type="hidden" name="back" value={back} />
                            <button
                              type="submit"
                              title={
                                reviewed
                                  ? `Reviewed by ${e.reviewed_by ?? "you"}${
                                      e.reviewed_at ? ` on ${formatWhen(e.reviewed_at)}` : ""
                                    } — click to un-tick`
                                  : "Mark as reviewed"
                              }
                              aria-label={reviewed ? "Mark as not reviewed" : "Mark as reviewed"}
                              className={`w-6 h-6 border font-body leading-none ${
                                reviewed
                                  ? "border-rasta-green bg-rasta-green text-paper"
                                  : "border-paper-stain bg-paper hover:bg-parchment-deep"
                              }`}
                            >
                              {reviewed ? "✓" : ""}
                            </button>
                          </form>
                        </td>
                      )}
                      <td className="px-3 py-2 align-top whitespace-nowrap text-ink-soft">
                        {formatWhen(e.created_at)}
                      </td>
                      <td className="px-3 py-2 align-top font-body break-words">
                        <ChangeCell e={e} />

                        {e.note && (
                          <div className="mt-2 border-l-4 border-rasta-gold bg-rasta-gold/15 px-3 py-2">
                            <p className="font-body text-xs uppercase tracking-wider text-ink font-semibold mb-0.5">
                              ✎ Note to editor
                            </p>
                            <p className="text-ink">{e.note}</p>
                            {e.note_by && (
                              <p className="text-ink-soft text-xs mt-1">
                                &mdash; {e.note_by}
                              </p>
                            )}
                          </div>
                        )}

                        {isAdmin && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs text-link hover:text-rasta-red select-none">
                              {e.note ? "Edit note" : "Leave a note for the editor"}
                            </summary>
                            <form action="/api/mod-log" method="POST" className="mt-2 flex flex-col gap-2">
                              <input type="hidden" name="action" value="note" />
                              <input type="hidden" name="logId" value={e.id} />
                              <input type="hidden" name="back" value={back} />
                              <textarea
                                name="note"
                                rows={3}
                                maxLength={2000}
                                defaultValue={e.note ?? ""}
                                placeholder="What needs changing, or why this isn't right…"
                                className="w-full border border-paper-stain bg-paper px-2 py-1 font-body text-ink focus:outline-none focus:border-rasta-red"
                              />
                              <div className="flex items-center gap-3">
                                <button
                                  type="submit"
                                  className="px-3 py-1 bg-frame text-paper font-body text-xs tracking-wide hover:bg-rasta-red transition-colors"
                                >
                                  Save note
                                </button>
                                <span className="text-xs text-ink-soft">
                                  {e.note
                                    ? "Clearing the box removes the note."
                                    : "The editor sees this on the record's page."}
                                </span>
                              </div>
                            </form>
                          </details>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap text-ink">
                        {e.editor_name}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        {recordId != null ? (
                          <Link
                            href={`/records/${recordId}`}
                            className="text-link hover:text-rasta-red"
                          >
                            #{recordId}
                          </Link>
                        ) : (
                          <span className="text-ink-soft text-xs" title="This record has been deleted">
                            &mdash;
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} searchParams={backParams} />
        </>
      )}
    </div>
  );
}
