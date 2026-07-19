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
  if (e.action === "modified") {
    const from = e.old_value ? `“${e.old_value}”` : "(blank)";
    const to = e.new_value ? `“${e.new_value}”` : "(blank)";
    return `${e.field}: ${from} → ${to}`;
  }
  return e.action;
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

  return (
    <section className="frame-double bg-parchment/40 p-5 sm:p-7">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg text-ink">Editor Tools</h3>
        <span className="font-body text-xs text-ink-soft">signed in as {editorName}</span>
      </div>

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

      <div>
        <h4 className="font-body text-xs uppercase tracking-wide text-ink-soft mb-2">
          Modification Log
        </h4>
        {log.length === 0 ? (
          <p className="font-body text-sm text-ink-soft italic">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-1.5 font-body text-sm">
            {log.map((e, i) => (
              <li key={i} className="break-words">
                <span className="text-ink-soft">{formatWhen(e.created_at)}</span>{" "}
                <span className="text-ink">— {logLine(e)}</span>{" "}
                {e.editor_name && <span className="text-ink-soft">({e.editor_name})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
