import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/requireAdmin";
import { createRecord, EDITABLE_FIELDS, type EditableField } from "@/lib/editor/overlay";
import { SECOND_SIDE_PREFIX } from "@/components/EditorRecordForm";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

export const maxDuration = 60;

// Facts about the physical record rather than either song, so the second
// entry inherits them when left blank.
const SHARED: EditableField[] = ["label", "country", "year", "format"];

// How a song is referred to FROM the other side's entry. The catalogue gives a
// flip side these six columns and no more.
const AS_B_SIDE: [EditableField, EditableField][] = [
  ["artist", "b_side_artist"],
  ["artist_credit", "b_side_artist_credit"],
  ["title", "b_side_title"],
  ["title_credit", "b_side_title_credit"],
  ["matrix_number", "b_side_matrix_number"],
  ["label_number", "b_side_label_number"],
];

type Fields = Partial<Record<EditableField, string | null>>;

function readFields(form: FormData, prefix: string): Fields {
  const out: Fields = {};
  for (const field of EDITABLE_FIELDS) {
    const key = `${prefix}${field}`;
    if (form.has(key)) out[field] = String(form.get(key) ?? "");
  }
  return out;
}

function has(fields: Fields, field: EditableField): boolean {
  return !!fields[field]?.trim();
}

/** Copies a song's identity into the other entry's B-side columns. */
function pointAt(target: Fields, song: Fields): void {
  for (const [from, to] of AS_B_SIDE) {
    if (has(song, from)) target[to] = song[from];
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const editor = { uid: session.uid, name: session.name };
  const first = readFields(form, "");

  if (!has(first, "title") && !has(first, "artist")) {
    return NextResponse.redirect(new URL("/records/new?createError=empty", request.url));
  }

  // The optional second song. The catalogue has no B-side producer, riddim or
  // genre, so a flip side that needs them can only be recorded as its own
  // entry — which is what the compiler's own paired entries already are. Doing
  // it here means the editor describes the record once instead of entering it,
  // going back in, and entering it again from the other side.
  const second = readFields(form, SECOND_SIDE_PREFIX);
  const wantsPair = has(second, "title") || has(second, "artist");

  let newId: number;
  try {
    if (wantsPair) {
      for (const field of SHARED) {
        if (!has(second, field) && has(first, field)) second[field] = first[field];
      }
      // Each entry names the other as its flip side, so whichever one a
      // visitor lands on shows what is on the back of the record.
      pointAt(first, second);
      pointAt(second, first);

      newId = await createRecord(first, editor);
      await createRecord(second, editor);
    } else {
      newId = await createRecord(first, editor);
    }
  } catch {
    return NextResponse.redirect(new URL("/records/new?createError=1", request.url));
  }

  revalidateTag(CATALOGUE_TAG, { expire: 0 });

  return NextResponse.redirect(
    new URL(`/records/${newId}?created=${wantsPair ? "pair" : "1"}`, request.url)
  );
}
