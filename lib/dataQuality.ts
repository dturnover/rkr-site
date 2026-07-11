// The source discography data occasionally contains a compiler's editorial
// flag ("dubious entry") in place of a real value for a field he wasn't
// confident about — found leaking into the public UI in multiple places
// during a UAT pass (a Label No./Additions field, a Matrix No. cell in a
// results table, and its own bucket on the Genre browse page), displayed
// identically to genuine data with no indication it isn't one. This is
// deliberately a narrow, exact-match list of markers actually observed in
// the data, not a heuristic — the goal is to flag a known editorial note
// distinctly, not to guess at what might be "wrong" data (that's a
// judgment call for whoever curates the source CSV, not this app).
const UNCERTAIN_VALUE_MARKERS = new Set(["dubious entry"]);

export function isUncertainValue(value: string | null | undefined): boolean {
  if (!value) return false;
  return UNCERTAIN_VALUE_MARKERS.has(value.trim().toLowerCase());
}
