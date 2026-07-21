import Link from "next/link";
import type { RecordDetail } from "@/lib/queries/records";
import { hasBSide } from "@/lib/queries/records";
import { facetLink, type FacetSlug } from "@/lib/facetConfig";
import { isUncertainValue } from "@/lib/dataQuality";

function Field({
  label,
  value,
  mono,
  facet,
  wrap,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  facet?: FacetSlug;
  wrap?: boolean;
}) {
  if (!value) return null;
  const uncertain = isUncertainValue(value);
  const href = !uncertain && facet ? facetLink(facet, value) : null;
  return (
    <div
      className={`flex ${wrap ? "flex-col" : "flex-col sm:flex-row sm:gap-3"} py-1.5 border-b border-paper-stain/50 last:border-b-0`}
    >
      <dt className="font-body text-xs uppercase tracking-wide text-ink-soft sm:w-36 shrink-0 pt-0.5">
        {label}
      </dt>
      <dd
        className={`font-body whitespace-pre-line break-words ${mono ? "font-catalog text-sm" : ""} ${
          uncertain ? "italic text-ink-soft" : "text-ink"
        }`}
      >
        {uncertain ? (
          <span title="The compiler flagged this entry as uncertain — not a confirmed value.">
            {value} (uncertain)
          </span>
        ) : href ? (
          <Link href={href} className="hover:text-rasta-red hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

// The source data stores Version as a raw lowercase "yes"/etc., unlike every
// other field which is already proper-cased ("Ska", "JA") — rendered as-is
// it reads like an unformatted database dump leaking through.
function capitalizeFirst(value: string | null): string | null {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function TrackDetailCard({ record }: { record: RecordDetail }) {
  const showBSide = hasBSide(record);

  return (
    <div className="space-y-6">
      <section className="frame-double bg-paper p-5 sm:p-7">
        <h2 className="font-display text-xl text-rasta-red mb-1">A-Side</h2>
        <h3 className="font-body text-2xl text-ink mb-4">
          {record.title || "Untitled"}
          {record.title_credit ? (
            <span className="text-ink-soft italic text-base"> ({record.title_credit})</span>
          ) : null}
        </h3>
        <dl>
          <Field label="Artist" value={record.artist} facet="artists" />
          <Field label="Artist Credit" value={record.artist_credit} />
          <Field label="Country" value={record.country} facet="countries" />
          <Field label="Year Released" value={record.year} facet="years" />
          <Field label="Format" value={record.format} facet="formats" />
          <Field label="Label" value={record.label} facet="labels" />
          <Field label="Label No." value={record.label_number} mono />
          <Field label="Matrix No." value={record.matrix_number} mono />
          <Field label="Producer" value={record.producer} facet="producers" />
          <Field label="Riddim" value={record.riddim} facet="riddims" />
          <Field label="Genre" value={record.genre} facet="genres" />
          <Field label="Version Side?" value={capitalizeFirst(record.version)} />
          <Field label="Song Origin" value={record.song_origin} facet="origins" />
          {/* "Additions" is deliberately not shown: it's the compiler's own
              private working column (tracking what he added to an entry), not
              catalogue information for visitors. Still imported and stored —
              just not surfaced. */}
          <Field label="Notes" value={record.notes} wrap />
        </dl>
      </section>

      {showBSide && (
        <section className="frame-double bg-paper p-5 sm:p-7">
          <h2 className="font-display text-xl text-rasta-green mb-1">B-Side</h2>
          <h3 className="font-body text-2xl text-ink mb-4">
            {record.b_side_title || "Untitled"}
            {record.b_side_title_credit ? (
              <span className="text-ink-soft italic text-base"> ({record.b_side_title_credit})</span>
            ) : null}
          </h3>
          <dl>
            <Field label="Artist" value={record.b_side_artist} facet="artists" />
            <Field label="Artist Credit" value={record.b_side_artist_credit} />
            <Field label="Label No." value={record.b_side_label_number} mono />
            <Field label="Matrix No." value={record.b_side_matrix_number} mono />
          </dl>
        </section>
      )}
    </div>
  );
}
