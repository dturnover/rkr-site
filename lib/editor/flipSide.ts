import type { RecordDetail } from "@/lib/queries/records";
import type { EditableField } from "@/lib/editor/overlay";

// Turning a record's flip side into its own entry.
//
// The catalogue gives a B side six columns — artist, credit, title, title
// credit, label number, matrix number — and no more. There is no B-side
// producer, riddim, genre or year, in the source spreadsheet either, so an
// editor entering a record whose flip side deserves full detail runs out of
// form and reasonably concludes the form is broken.
//
// The compiler's own convention is to enter that song AGAIN as the A side of a
// second entry sharing the label number, which is what produces the paired
// entries a 12" is made of. This builds the starting values for that second
// entry so it doesn't have to be retyped: the two sides swap places, and the
// facts that belong to the physical record rather than to either song are
// carried across.

/** Fields describing the object rather than the song, so they hold for both
 * sides and are worth copying. Everything else about a song — its riddim,
 * genre, version status, origin, notes — is exactly what the second entry
 * exists to record separately, so those are deliberately left blank. */
const SHARED_FIELDS: EditableField[] = ["label", "country", "year", "format", "producer"];

export function flipSideValues(record: RecordDetail): Partial<Record<EditableField, string>> {
  const values: Partial<Record<EditableField, string>> = {};
  const set = (field: EditableField, value: string | null | undefined) => {
    if (value?.trim()) values[field] = value;
  };

  // The flip side becomes the A side of the new entry…
  set("artist", record.b_side_artist);
  set("artist_credit", record.b_side_artist_credit);
  set("title", record.b_side_title);
  set("title_credit", record.b_side_title_credit);
  set("label_number", record.b_side_label_number);
  set("matrix_number", record.b_side_matrix_number);

  // …and the side that was showing becomes its flip, so the two entries point
  // at each other the way the existing paired entries do.
  set("b_side_artist", record.artist);
  set("b_side_artist_credit", record.artist_credit);
  set("b_side_title", record.title);
  set("b_side_title_credit", record.title_credit);
  set("b_side_label_number", record.label_number);
  set("b_side_matrix_number", record.matrix_number);

  for (const field of SHARED_FIELDS) {
    set(field, record[field as keyof RecordDetail] as string | null);
  }

  return values;
}

/** Whether there is a flip side worth giving its own entry. */
export function hasFlipSide(record: RecordDetail): boolean {
  return !!record.b_side_title?.trim() || !!record.b_side_artist?.trim();
}
