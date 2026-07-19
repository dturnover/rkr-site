import type { Metadata } from "next";
import ProsePage from "@/components/ProsePage";

export const metadata: Metadata = {
  title: "User's Guide — Roots Knotty Roots",
  description:
    "How to read a Roots Knotty Roots listing: artist, title, matrix and label numbers, format, country, producer, date, riddim, origin, notes, genre, and B-side information.",
};

export default function GuidePage() {
  return (
    <ProsePage title="User's Guide">
      <p>
        RKR obsessively documents singles released from 1952 through 1999, a time when
        the 45 was far and away Jamaica&rsquo;s most popular musical format. Its listings
        approximate 99% of the records from the golden era of Jamaican recordings, hence
        the information contained in RKR is also the real story of Jamaican music. Although
        RKR has evolved into a comprehensive historical document, it continues to exist
        mainly as a tool for record collectors, selectors, and fans. We use as our
        perspective that single record that you are holding in your hand, playing, or
        checking out online.
      </p>
      <p>
        Our aim is to give as much information as possible about this record, whether
        it&rsquo;s explicitly given on the label or inferred through our detective work.
        This information breaks down into the following categories:
      </p>

      <h2>Artist</h2>
      <p>
        Correct artist identification is often tricky. Thousands of records were released
        only on blank labels, and although artists have been identified on most of these, a
        substantial number remain unidentified. Then there are the hundreds of miscredits,
        intentional and unintentional, as well as a large number of misspellings.
        Furthermore, many artists recorded under different names — for example, Max Romeo
        used at least 10 different aliases during his long recording career.
      </p>
      <p>For purposes of clarity we have employed a &ldquo;dual&rdquo; artist identification:</p>
      <p>
        1) The artist&rsquo;s real name, that is, the one most generally recognized. Thus
        Slim Smith not Keith Smith, Eek A Mouse not Ripton Hylton, etc.
      </p>
      <p>
        2) The literal label attribution. Thus the listing for &ldquo;Rule the Nation&rdquo;
        will credit U Roy as above, but will also show &ldquo;Hugh Roy with Tommy McCook
        and The Supersonics&rdquo;.
      </p>

      <h2>Title</h2>
      <p>
        Again, correct identification is not always straightforward. Although most of the
        titles listed on original Jamaican labels are correct, the names tended to mutate
        over subsequent releases. This was particularly true for titles issued abroad. For
        example, the same Clancy Eccles record was released four times (in two countries)
        with three different titles: Africa, We A Black Man, We Want Go Home. Another
        example of mutation: The Soulettes&rsquo; Time To Turn is also known as Time For
        Everything, the title given on the subsequent Studio 1 compilation Jamaica All
        Stars. We try to list all such title variants, with the original appearing first and
        subsequent names listed parenthetically. Occasionally you will see titles written in
        lower case; these are generally speculations about blank label releases.
      </p>

      <h2>Matrix Number</h2>
      <p>
        The combination of letters and numbers etched into the run-out groove is, with few
        exceptions, unique to each individual recording. Matrix numbers are so reliable that
        we essentially anchor each listing around them. Over the years, as we&rsquo;ve added
        these numbers, we have concomitantly been able to purge most of our redundant and
        superfluous information.
      </p>
      <p>
        Although there are many variations, the matrix frequently identifies the pressing
        plant and the producer, along with a number. For example, Melody Life by Marcia
        Griffiths, imprinted Wirl CD 4310, was pressed at West Indies Records Ltd. (WIRL)
        for Coxsone Dodd (CD). The combination of letters and numbers places the song in
        series with a number of classic Dodd recordings from 1968, including Larry &amp;
        Alvin&rsquo;s Nanny Goat (Wirl CD 4398) and the Cables&rsquo; Baby Why (Wirl CD
        4349). It&rsquo;s easy to deride record collectors and their obsessions with
        minutiae, but in fact the matrix number is often the only tangible data that locates
        a piece of music to its specific time and place.
      </p>

      <h2>Label Number</h2>
      <p>
        The label number is usually of secondary importance in Jamaican music, but the
        primary identifier in UK, US, and other &ldquo;foreign&rdquo; issues. Usually the
        label number corresponds to the matrix number; where exceptions exist, these are
        noted.
      </p>

      <h2>Label</h2>
      <p>
        This is fairly obvious, as usually there was one label per matrix number. But popular
        records often came out on multiple labels, particularly from big producers like
        Coxsone Dodd. If there was a single uniting matrix number, these would appear on the
        same line, as in Coxsone/Studio 1 or Randy&rsquo;s/Impact. Other label information:
        blanks are listed as &ldquo;pre&rdquo;; later pressings are noted as
        &ldquo;reissue&rdquo;.
      </p>

      <h2>Format</h2>
      <p>
        We list tens of thousands of 7&Prime; singles, along with 12&Prime;, 10&Prime;, 78
        RPM records, and EPs (multi-track singles).
      </p>

      <h2>Country</h2>
      <p>
        Refers to the country where a particular record was released (not recorded).
        Originally we aimed only to trace Jamaican productions. But as the Jamaican community
        dispersed abroad, so did Jamaican artists, many of whom made records in Jamaica,
        North America, and the U.K. And even in the earliest times a lot of Jamaican music
        has been made by people who were not born in Jamaica.
      </p>
      <p>
        The question has always been where to draw the line. In the end we decided to
        document all music made by and for the Jamaican community. This definition eliminates
        a lot of music done in &ldquo;Jamaican&rdquo; style, like reggae music made in
        Africa, Two Tone music and other revivals, pop adaptations and imitations, and most
        other Caribbean singles. But even within our narrower definition RKR contains
        listings from more than 20 countries.
      </p>

      <h2>Producer</h2>
      <p>
        Production credits became standardized through the years, but there are many obscure
        figures associated with early recordings. Some of the credits given here are at best
        educated guesses, particularly with regard to blanks.
      </p>

      <h2>Date</h2>
      <p>
        This is another ambiguous area. Many Jamaican records were done quickly — the year
        on a label usually references the time of recording, pressing, and release. But there
        could be considerable delay between any of these steps, and of course further passage
        of time when a recording traveled abroad. Matrix numbers are often quite useful but
        still fallible when determining a date for records without label information. A
        general rule of thumb is that a given date should be read as plus/minus one year. The
        main reason we try to assign a date to every listing is to give a general indication
        of musical style.
      </p>

      <h2>Riddim</h2>
      <p>
        If you know Jamaican music, you already know what a riddim is. There are already some
        great websites that identify riddims, and they do a particularly good job with the
        many lickovers done in the digital era. Our listings are probably stronger in our
        coverage of older music and some of the more obscure riddims.
      </p>

      <h2>Origin</h2>
      <p>
        This section owes a lot to Peter Piper&rsquo;s excellent website{" "}
        <a href="http://www.skaville.de" target="_blank" rel="noopener noreferrer">
          Skaville: Cover Versions In Jamaican 60s Music
        </a>
        , which organized for the first time a topic much discussed by aficionados over the
        years: where did that song come from? That site remains in many ways the last word on
        this subject, although we have done a lot of independent research and hopefully have
        expanded these musical origins somewhat, particularly with regard to Jamaican music
        from later eras.
      </p>

      <h2>Notes</h2>
      <p>
        We try to include a variety of miscellaneous information when possible, such as studio
        musicians and recording information (engineers, mixers, arrangers). Some of this info
        comes from labels, some from artist interviews.
      </p>
      <p>
        You will also occasionally see <em>dubious entry</em>, referring mostly to missing JA
        issues which have been released as singles abroad. Many dubious entries are phantoms,
        and we would appreciate help from anyone who actually owns any of these titles.
      </p>

      <h2>Genre</h2>
      <p>
        Jamaican music is much more than ska, rocksteady, and reggae. Particularly in the 60s
        there was an active market for ballads, spirituals, and traditional musics, as well as
        recordings done in various soul and pop styles. Some of our designations are somewhat
        arbitrary — for example we use the term blue beat to designate proto-ska, and
        dancehall is used for tunes that largely employ &ldquo;digital&rdquo; instrumentation.
        The purpose of this category is in part to help a buyer know what they&rsquo;re
        getting.
      </p>

      <h2>B-Side Information</h2>
      <p>
        Each RKR entry identifies the music on the B side. Up until 1970 Jamaican singles were
        two-siders, with different tunes on the A and B sides. There could be lots of
        variability; for now we have not tried to document all pairings, and the listing is
        limited to what was found on the original release (whenever possible).
      </p>
      <p>
        After 1970 singles were increasingly released with instrumental versions on the B
        side. We list as much information about the version sides as we can. You will see the
        question <em>Is the B Side A Version?</em>, which might seem odd but is particularly of
        interest to selectors. Sometimes it&rsquo;s helpful to be able to answer this question
        — for example, Road Block by Bob Marley and the Wailers lists as its B side Rebel
        Music, but this is a version side, not a different Marley vocal. Listing these versions
        also gives us an opportunity to credit the many studio bands which were the backbone of
        all this music.
      </p>
    </ProsePage>
  );
}
