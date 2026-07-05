import type { RecordDetail } from "@/lib/queries/records";
import { hasBSide } from "@/lib/queries/records";

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3 py-1.5 border-b border-paper-stain/50 last:border-b-0">
      <dt className="font-body text-xs uppercase tracking-wide text-ink-soft sm:w-36 shrink-0 pt-0.5">
        {label}
      </dt>
      <dd className={`font-body text-ink ${mono ? "font-catalog text-sm" : ""}`}>{value}</dd>
    </div>
  );
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
          <Field label="Artist" value={record.artist} />
          <Field label="Artist Credit" value={record.artist_credit} />
          <Field label="Country" value={record.country} />
          <Field label="Year Released" value={record.year} />
          <Field label="Format" value={record.format} />
          <Field label="Label" value={record.label} />
          <Field label="Label No." value={record.label_number} mono />
          <Field label="Matrix No." value={record.matrix_number} mono />
          <Field label="Producer" value={record.producer} />
          <Field label="Riddim" value={record.riddim} />
          <Field label="Genre" value={record.genre} />
          <Field label="Version" value={record.version} />
          <Field label="Song Origin" value={record.song_origin} />
          <Field label="Additions" value={record.additions} />
          <Field label="Notes" value={record.notes} />
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
            <Field label="Artist" value={record.b_side_artist} />
            <Field label="Artist Credit" value={record.b_side_artist_credit} />
            <Field label="Label No." value={record.b_side_label_number} mono />
            <Field label="Matrix No." value={record.b_side_matrix_number} mono />
          </dl>
        </section>
      )}
    </div>
  );
}
