// The body of the User's Guide, extracted so it can render in two places from
// one source: the standalone /guide page and the home page's guide section.
// It's just the prose nodes — the surrounding heading styles come from the
// PROSE_CLASS wrapper the caller applies (see ProsePage).

// A small illustrative block (e.g. Artist / Artist Credit) rendered as a
// labelled example beside the prose. Sits on the parchment tone so it reads as
// a callout rather than body copy.
function Example({ rows }: { rows: [string, string][] }) {
  return (
    <div className="frame-double bg-parchment/50 px-4 py-3 my-4 font-body text-sm">
      <dl className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="uppercase text-xs tracking-wide text-ink-soft sm:w-40 shrink-0 pt-0.5">
              {label}
            </dt>
            <dd className="text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function GuideContent() {
  return (
    <>
      <p>
        Roots Knotty Roots documents more than 135,000 Jamaican singles released
        between 1950 and 1999. It is designed as a practical research tool for
        collectors, selectors, dealers, historians, and fans. Each listing combines
        information gleaned from record labels, matrix numbers, interviews,
        publications, and decades of original research. Every entry is built around
        the individual record you are holding in your hand, playing on a turntable,
        or viewing online.
      </p>

      <h2>Quick Start</h2>
      <ul className="space-y-1 list-none pl-0">
        <li>
          <strong>Search</strong> &mdash; Find exactly the record you&rsquo;re looking for.
        </li>
        <li>
          <strong>Sort</strong> &mdash; Rearrange results by any category.
        </li>
        <li>
          <strong>Browse</strong> &mdash; Explore artists, labels, producers, riddims,
          genres and more.
        </li>
      </ul>

      <h2>Search</h2>
      <p>
        Search is RKR&rsquo;s most powerful feature. Every record can be searched
        across the categories below. Advanced Search allows multiple categories to be
        combined to answer more specific questions.
      </p>

      <h3>Artist</h3>
      <p>
        Correctly identifying artists is often challenging. There are many miscredits,
        misspellings, and aliases. Max Romeo, for example, used at least ten different
        recording names during his career. Adding to the confusion, thousands of
        Jamaican singles were issued on pre-release blank labels.
      </p>
      <p>RKR identifies artists in two ways:</p>
      <p>
        <strong>Artist.</strong> The best known, generally accepted name.
        <br />
        <strong>Artist Credit.</strong> The name that appears on the record label.
      </p>
      <Example
        rows={[
          ["Artist", "U Roy"],
          ["Artist Credit", "Hugh Roy with Tommy McCook and The Supersonics"],
        ]}
      />

      <h3>Title</h3>
      <p>
        Similar confusion occurs around titles. Although most original Jamaican labels
        carried the correct title, names often changed during subsequent reissues,
        especially those released overseas. So RKR shows both the &ldquo;real&rdquo;
        title and the exact wording printed on an individual label. A funny example of
        this is a Prince Buster tune that came out with a different title when released
        in the UK:
      </p>
      <Example
        rows={[
          ["Title", "She Pon Top"],
          ["Title Credit", "Sheep On Top"],
        ]}
      />

      <h3>Matrix Number</h3>
      <p>
        The combination of letters and numbers etched into a record&rsquo;s run-out
        groove is, with very few exceptions, unique to each individual recording.
        Matrix numbers are so reliable that they serve as the foundation and basic
        organizing principle of this entire database.
      </p>
      <Example rows={[["Typical Matrix", "WIRL PB 3655 LGA"]]} />
      <p>
        <strong>Prefix</strong> &mdash; Studio, pressing plant, producer, or company
        responsible for creating the matrix.
        <br />
        <strong>Sequence Number</strong> &mdash; Unique recording number within the
        matrix series; often the best dating clue.
        <br />
        <strong>Suffix</strong> &mdash; Later mastering or manufacturing information.
      </p>

      <h3>Label Number</h3>
      <p>
        The label number is generally of secondary importance on Jamaican releases but
        serves as the primary identifier on many British, American, and other overseas
        issues.
      </p>

      <h3>Label</h3>
      <p>
        Usually there was only one label associated with a particular matrix number.
        Popular recordings, however, often appeared on multiple labels, especially on
        later re-issues. All blank label pressings are identified as &ldquo;pre&rdquo;
        (for pre-release).
      </p>

      <h3>Format</h3>
      <p>7-inch singles, plus 10-inch, 12-inch, 78 rpm records, and EPs.</p>

      <h3>Country</h3>
      <p>
        This refers to where a particular record was released, not necessarily where it
        was recorded. The general idea is to document records from the Jamaican
        community at home and abroad, but with its international popularity we now
        display releases from more than 60 countries.
      </p>

      <h3>Producer</h3>
      <p>
        This generally refers to the person who financed the recording and pressing
        process, not the person running the session.
      </p>

      <h3>Date</h3>
      <p>
        Refers to the year of release. Dates not found on the record must be identified
        by using other label information such as telephone numbers, addresses and
        printing techniques as well as matrix numbers and contemporary music charts.
      </p>

      <h3>Riddim</h3>
      <p>
        With over 53,000 listings, RKR is at least as comprehensive as any other online
        riddim reference site, while providing much more historical context.
      </p>

      <h3>Origin</h3>
      <p>
        Jamaican artists were heavily influenced by music from abroad; this has resulted
        in our listing of over 15,000 cover tunes. We try to fully identify the original
        artist, title and date of issue.
      </p>

      <h3>Genre</h3>
      <p>
        Jamaica was not just the land of ska, rocksteady and reggae. RKR listings
        identify over 30 distinct genres.
      </p>

      <h3>B-Side Information</h3>
      <p>Identifies the B-side and whether it is a version whenever possible.</p>

      <h2>Sort</h2>
      <p>
        For any search result you can click any column heading to instantly rearrange
        results chronologically or by producer, label, country, matrix number, genre,
        or other category.
      </p>

      <h2>Browse</h2>
      <p>
        I don&rsquo;t think there will ever be another edition of RKR in book form, but
        the Browse function comes close. The Browse buttons allow you to read all
        categories in alphabetical order.
      </p>
    </>
  );
}
