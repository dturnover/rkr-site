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
  // "additions" is intentionally absent — it's the compiler's private working
  // column, not something editors should set. Because the save route only
  // applies fields actually present in the submitted form, leaving it out
  // preserves whatever value the record already has.
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

/** Namespace for the optional second song's inputs. The create route reads it
 * back to decide whether one entry is being made or a pair. */
export const SECOND_SIDE_PREFIX = "side2_";

const inputClass =
  "border border-paper-stain bg-paper px-2 py-1.5 font-body text-sm text-ink focus:outline-none focus:border-rasta-red w-full";

/** `prefix` namespaces the inputs so a second full song can be entered on the
 * same form without colliding with the first (see SECOND_SIDE_PREFIX). */
function FieldInputs({
  fields,
  values,
  prefix = "",
}: {
  fields: FieldDef[];
  values: Partial<Record<string, string | null>>;
  prefix?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
      {fields.map((f) => (
        <label key={f.name} className={`flex flex-col gap-1 ${f.area ? "sm:col-span-2" : ""}`}>
          <span className="font-body text-xs uppercase tracking-wide text-ink-soft">{f.label}</span>
          {f.area ? (
            <textarea
              name={`${prefix}${f.name}`}
              rows={2}
              defaultValue={prefix ? "" : values[f.name] ?? ""}
              className={inputClass}
            />
          ) : (
            <input
              type="text"
              name={`${prefix}${f.name}`}
              defaultValue={prefix ? "" : values[f.name] ?? ""}
              className={inputClass}
            />
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
  allowSecondSide = false,
}: {
  action: string;
  recordId?: number;
  values: Partial<Record<string, string | null>>;
  submitLabel: string;
  /** Offer to describe the flip side as a full song too, creating both
   * entries at once. Only on creation — editing changes one entry. */
  allowSecondSide?: boolean;
}) {
  return (
    <form action={action} method="POST" className="flex flex-col gap-6">
      {recordId != null && <input type="hidden" name="recordId" value={recordId} />}

      <div>
        <h4 className="font-display text-lg text-rasta-red mb-3">A-Side</h4>
        <FieldInputs fields={A_SIDE} values={values} />
      </div>

      <div className="border-l-2 border-rasta-gold pl-3 font-body text-sm text-ink-soft">
        {/* The six B-side columns below are all the catalogue has — there is no
            B-side producer, riddim, genre or year, in the spreadsheet either.
            Editors hit this and reasonably assume the form is missing fields,
            so say plainly that it isn't, and point at the convention the
            compiler actually uses. */}
        The B-side fields below are deliberately brief &mdash; the catalogue records a flip side
        by artist, title and numbers only, and has no B-side producer, riddim or genre.
        {allowSecondSide ? (
          <>
            {" "}
            If the flip side is a song in its own right, use{" "}
            <strong>Describe the B-side fully</strong> below and both entries are made together.
          </>
        ) : (
          <>
            {" "}
            To give a flip side its <em>own</em> producer, riddim or genre, add it as a second
            entry with that song as the A-side.
          </>
        )}
      </div>

      <div>
        <h4 className="font-display text-lg text-rasta-green mb-3">B-Side</h4>
        <FieldInputs fields={B_SIDE} values={values} />
      </div>

      {allowSecondSide && (
        <details className="border-2 border-frame bg-parchment/30 p-4">
          <summary className="cursor-pointer font-body text-ink select-none">
            <strong>Describe the B-side fully</strong>{" "}
            <span className="text-ink-soft text-sm">
              &mdash; when the flip side is a song in its own right
            </span>
          </summary>
          <p className="font-body text-sm text-ink-soft mt-3 mb-4">
            Fill this in and <strong>two entries are created in one go</strong>: this record from
            the A-side&rsquo;s point of view, and a second from the B-side&rsquo;s, each carrying
            its own producer, riddim, genre and notes. They point at each other, and label,
            country, year and format carry over from above if you leave them blank here. Leave
            this closed for an ordinary single &mdash; the six B-side fields above are enough.
          </p>
          <FieldInputs fields={A_SIDE} values={{}} prefix={SECOND_SIDE_PREFIX} />
        </details>
      )}

      <button
        type="submit"
        className="self-start px-5 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
      >
        {submitLabel}
      </button>
    </form>
  );
}
