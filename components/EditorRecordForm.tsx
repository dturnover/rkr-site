import type { EditableField } from "@/lib/editor/overlay";

type FieldDef = { name: EditableField; label: string; area?: boolean };

const A_SIDE: FieldDef[] = [
  { name: "artist", label: "Artist" },
  { name: "artist_credit", label: "Artist Credit" },
  { name: "title", label: "Title" },
  { name: "title_credit", label: "Title Credit" },
  { name: "country", label: "Country" },
  { name: "year", label: "Year Released" },
  { name: "format", label: "Format" },
  { name: "label", label: "Label" },
  { name: "label_number", label: "Label No." },
  { name: "matrix_number", label: "Matrix No." },
  { name: "producer", label: "Producer" },
  { name: "riddim", label: "Riddim" },
  { name: "genre", label: "Genre" },
  { name: "version", label: "Version Side? (yes/blank)" },
  { name: "song_origin", label: "Song Origin" },
  { name: "additions", label: "Additions", area: true },
  { name: "notes", label: "Notes", area: true },
];

const B_SIDE: FieldDef[] = [
  { name: "b_side_artist", label: "B-Side Artist" },
  { name: "b_side_artist_credit", label: "B-Side Artist Credit" },
  { name: "b_side_title", label: "B-Side Title" },
  { name: "b_side_title_credit", label: "B-Side Title Credit" },
  { name: "b_side_label_number", label: "B-Side Label No." },
  { name: "b_side_matrix_number", label: "B-Side Matrix No." },
];

const inputClass =
  "border border-paper-stain bg-paper px-2 py-1.5 font-body text-sm text-ink focus:outline-none focus:border-rasta-red w-full";

function FieldInputs({ fields, values }: { fields: FieldDef[]; values: Partial<Record<string, string | null>> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
      {fields.map((f) => (
        <label key={f.name} className={`flex flex-col gap-1 ${f.area ? "sm:col-span-2" : ""}`}>
          <span className="font-body text-xs uppercase tracking-wide text-ink-soft">{f.label}</span>
          {f.area ? (
            <textarea name={f.name} rows={2} defaultValue={values[f.name] ?? ""} className={inputClass} />
          ) : (
            <input type="text" name={f.name} defaultValue={values[f.name] ?? ""} className={inputClass} />
          )}
        </label>
      ))}
    </div>
  );
}

/** Shared editable-fields form, used both for inline editing (with recordId +
 * a hidden action) and for creating a new track. Plain HTML form — posts and
 * redirects, no client JS. */
export default function EditorRecordForm({
  action,
  recordId,
  values,
  submitLabel,
}: {
  action: string;
  recordId?: number;
  values: Partial<Record<string, string | null>>;
  submitLabel: string;
}) {
  return (
    <form action={action} method="POST" className="flex flex-col gap-6">
      {recordId != null && <input type="hidden" name="recordId" value={recordId} />}

      <div>
        <h4 className="font-display text-lg text-rasta-red mb-3">A-Side</h4>
        <FieldInputs fields={A_SIDE} values={values} />
      </div>

      <div>
        <h4 className="font-display text-lg text-rasta-green mb-3">B-Side</h4>
        <FieldInputs fields={B_SIDE} values={values} />
      </div>

      <button
        type="submit"
        className="self-start px-5 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
      >
        {submitLabel}
      </button>
    </form>
  );
}
