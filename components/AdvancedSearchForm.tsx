const FIELDS: { name: string; label: string }[] = [
  { name: "artist", label: "Artist" },
  { name: "title", label: "Title" },
  { name: "label", label: "Label" },
  { name: "labelNumber", label: "Label No." },
  { name: "matrixNumber", label: "Matrix No." },
  { name: "producer", label: "Producer" },
  { name: "country", label: "Country" },
  { name: "format", label: "Format" },
  { name: "year", label: "Year Released" },
  { name: "genre", label: "Genre" },
  { name: "riddim", label: "Riddim" },
  { name: "origin", label: "Song Origin" },
  { name: "notes", label: "Notes" },
];

export default function AdvancedSearchForm({
  values,
}: {
  values: Record<string, string | undefined>;
}) {
  return (
    <form action="/advanced-search" method="GET" className="frame-double bg-paper p-5 sm:p-7">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {FIELDS.map((f) => (
          <label key={f.name} className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">
              {f.label}
            </span>
            <input
              type="text"
              name={f.name}
              defaultValue={values[f.name] ?? ""}
              className="border border-paper-stain bg-paper px-2 py-1.5 font-body text-ink focus:outline-none focus:border-rasta-red"
            />
          </label>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="submit"
          className="px-6 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
        >
          Search
        </button>
        <a
          href="/advanced-search"
          className="px-6 py-2 border border-frame text-ink font-body tracking-wide hover:bg-parchment-deep transition-colors"
        >
          Reset
        </a>
      </div>
    </form>
  );
}
