import Link from "next/link";
import type { RecordDetail } from "@/lib/queries/records";
import { EDITABLE_FIELDS, type LogEntry } from "@/lib/editor/overlay";
import EditorRecordForm from "./EditorRecordForm";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function logLine(e: LogEntry): string {
  if (e.action === "new") return "Created this record";
  if (e.action === "deleted") return `Deleted this record${e.old_value ? ` (${e.old_value})` : ""}`;
  if (e.action === "restored") return "Restored this record";
  if (e.action === "modified") {
    const from = e.old_value ? `“${e.old_value}”` : "(blank)";
    const to = e.new_value ? `“${e.new_value}”` : "(blank)";
    return `${e.field}: ${from} → ${to}`;
  }
  return e.action;
}

/** How the record is named back to the editor in the delete confirmation, so
 * they can see what they're about to remove without scrolling up. */
function deleteLabel(record: RecordDetail): string {
  const name = [record.artist?.trim(), record.title?.trim()].filter(Boolean).join(" – ");
  return name || `record ${record.id}`;
}

/** Editor-only panel shown beneath the read-only track card. Everything is
 * plain HTML (a <details> toggle + a form + a log list) — no client JS. */
export default function EditorPanel({
  record,
  log,
  editorName,
}: {
  record: RecordDetail;
  log: LogEntry[];
  editorName: string;
}) {
  const values: Partial<Record<string, string | null>> = {};
  for (const f of EDITABLE_FIELDS) values[f] = record[f as keyof RecordDetail] as string | null;

  // Notes the compiler left on this record's changes while reviewing the
  // Modification Log — surfaced at the top, since the whole point is that the
  // editor sees them without being emailed.
  const notes = log.filter((e) => !!e.note);

  return (
    <section className="frame-double bg-parchment/40 p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="font-display text-lg text-ink">
          Editor Tools
          {/* The number the Modification Log links by, shown so it can be
              matched up against the row that was clicked. Editors only — it's
              a row id, not a permanent catalogue number. */}
          <span className="font-body text-sm text-ink-soft ml-2">record #{record.id}</span>
        </h3>
        <span className="font-body text-xs text-ink-soft">signed in as {editorName}</span>
      </div>

      {notes.length > 0 && (
        <div className="border-2 border-rasta-gold bg-paper p-4 mb-4">
          <h4 className="font-body text-xs uppercase tracking-wide text-ink-soft mb-2">
            {notes.length === 1 ? "A note about this record" : "Notes about this record"}
          </h4>
          <ul className="space-y-3 font-body text-sm">
            {notes.map((n) => (
              <li key={n.id}>
                <p className="text-ink">{n.note}</p>
                <p className="text-ink-soft text-xs mt-0.5">
                  {n.note_by ?? "the compiler"}
                  {n.note_at ? `, ${formatWhen(n.note_at)}` : ""} &mdash; on &ldquo;{logLine(n)}
                  &rdquo;
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mb-4">
        <summary className="cursor-pointer font-body text-link hover:text-rasta-red select-none">
          Edit this record
        </summary>
        <div className="mt-4">
          <EditorRecordForm
            action="/api/editor/save"
            recordId={record.id}
            values={values}
            submitLabel="Save Changes"
          />
        </div>
      </details>

      <p className="font-body text-sm mb-4">
        <Link href="/records/new" className="text-link hover:text-rasta-red">
          + Add a new track
        </Link>
      </p>

      {/* Deleting is folded away behind its own <details> and gated on a
          checkbox, so it can't be hit by mistake while editing. */}
      <details className="mb-5">
        <summary className="cursor-pointer font-body text-sm text-error hover:underline select-none">
          Delete this record
        </summary>
        <div className="mt-3 border-2 border-error bg-paper p-4">
          <p className="font-body text-sm text-ink mb-3">
            Use this for an entry that shouldn&rsquo;t be in the discography at all &mdash; a
            duplicate, or a record that turned out not to exist. For anything that&rsquo;s merely
            wrong, correct the fields above instead.
          </p>
          <p className="font-body text-sm text-ink-soft mb-4">
            The deletion sticks: it is remembered separately from the catalogue, so the next
            spreadsheet upload won&rsquo;t bring the record back. An admin can undo it from the
            Editor Overrides page.
          </p>
          <form action="/api/editor/delete" method="POST" className="flex flex-col gap-3">
            <input type="hidden" name="recordId" value={record.id} />
            <label className="flex items-start gap-2 font-body text-sm text-ink">
              <input type="checkbox" name="confirm" value="yes" required className="mt-1" />
              <span>
                Yes, remove <strong>{deleteLabel(record)}</strong> from the discography.
              </span>
            </label>
            <button
              type="submit"
              className="self-start px-4 py-2 bg-error text-paper font-body tracking-wide hover:opacity-90 transition-opacity"
            >
              Delete Record
            </button>
          </form>
        </div>
      </details>

      <div>
        <h4 className="font-body text-xs uppercase tracking-wide text-ink-soft mb-2">
          Modification Log
        </h4>
        {log.length === 0 ? (
          <p className="font-body text-sm text-ink-soft italic">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-1.5 font-body text-sm">
            {log.map((e) => (
              <li key={e.id} className="break-words">
                <span className="text-ink-soft">{formatWhen(e.created_at)}</span>{" "}
                <span className="text-ink">— {logLine(e)}</span>{" "}
                {e.editor_name && <span className="text-ink-soft">({e.editor_name})</span>}
                {e.reviewed_at && (
                  <span className="text-rasta-green" title={`Reviewed by ${e.reviewed_by ?? "the compiler"}`}>
                    {" "}
                    ✓
                  </span>
                )}
                {e.note && (
                  <p className="border-l-2 border-rasta-gold pl-2 mt-1 text-ink">
                    {e.note}
                    <span className="text-ink-soft text-xs"> — {e.note_by ?? "the compiler"}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
