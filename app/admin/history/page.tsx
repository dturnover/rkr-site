import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/requireAdmin";
import { listImports } from "@/lib/import/importHistory";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default async function ImportHistoryPage() {
  const session = await getSession();
  if (!session) redirect("/admin");
  if (session.role !== "admin") redirect("/admin"); // admin only

  const imports = await listImports();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink">Import History</h1>
        <Link href="/admin" className="font-body text-sm text-ink-soft hover:text-rasta-red">
          &larr; Back to Admin
        </Link>
      </div>

      <p className="font-body text-sm text-ink-soft mb-6">
        The last {imports.length === 0 ? "few" : imports.length} catalogue uploads, newest first.
        Each one records exactly what it added and removed (editor edits included), so you can
        download the catalogue <strong>as it was before that upload</strong> as an Excel file. To
        roll back, download the point you want and re-upload it &mdash; the normal import will make
        the live catalogue match it.
      </p>

      {imports.length === 0 ? (
        <section className="frame-double bg-paper p-6">
          <p className="font-body text-ink">
            No incremental imports recorded yet. History starts building from the next upload.
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto border border-paper-stain">
          <table className="w-full min-w-[640px] text-sm bg-paper">
            <thead>
              <tr className="bg-parchment-deep border-b-2 border-frame font-body text-ink">
                <th className="text-left font-semibold px-3 py-2">When</th>
                <th className="text-right font-semibold px-3 py-2">Added</th>
                <th className="text-right font-semibold px-3 py-2">Removed</th>
                <th className="text-right font-semibold px-3 py-2">Total after</th>
                <th className="text-left font-semibold px-3 py-2">Restore point</th>
              </tr>
            </thead>
            <tbody className="font-body">
              {imports.map((imp, i) => (
                <tr key={imp.id} className={`border-b border-paper-stain/60 ${i % 2 ? "bg-parchment/30" : ""}`}>
                  <td className="px-3 py-2 align-top text-ink whitespace-nowrap">{fmtDate(imp.created_at)}</td>
                  <td className="px-3 py-2 align-top text-right text-rasta-green">
                    +{imp.inserted_count.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top text-right text-error">
                    &minus;{imp.deleted_count.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top text-right text-ink">
                    {imp.result_count.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {imp.truncated ? (
                      <span className="text-ink-soft text-xs italic">
                        too large to store &mdash; can&rsquo;t reconstruct
                      </span>
                    ) : (
                      <a
                        href={`/api/admin/history/export?before=${imp.id}`}
                        className="font-body text-xs border border-frame px-2 py-1 hover:bg-parchment-deep text-ink whitespace-nowrap"
                      >
                        Download “before” (.xlsx)
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
