import type { Metadata } from "next";
import ProsePage from "@/components/ProsePage";

export const metadata: Metadata = {
  title: "Interviews and Features — Roots Knotty Roots",
  description:
    "Interviews and features by Mike Turner — conversations with Jamaican artists, producers, and selectors, and writing on the music from The Beat, Afropop, and Dancecrasher.",
};

type Item = { label: string; href: string };
type Section = { heading: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    heading: "Dancecrasher",
    items: [
      { label: "King Edwards: Last Of The Original Soundmen", href: "https://s.reggaefever.ch/rkr/doc/Dancecrasher-King-Edwards.pdf" },
      { label: "The Gorgon Speaks: An Interview with Cornel Campbell", href: "http://www.dancecrasher.co.uk/interviewsdiscogs/interview-with-cornell-campbell/" },
      { label: "Count Your Blessings: An Interview With Ken Parker", href: "http://www.dancecrasher.co.uk/interviewsdiscogs/count-your-blessings-an-interview-with-ken-parker/" },
      { label: "It Sipple Out Deh: An Interview With Jah Lloyd", href: "http://www.dancecrasher.co.uk/interviewsdiscogs/it-sipple-out-deh/" },
    ],
  },
  {
    heading: "Afropop",
    items: [
      { label: "Best of The Beat on Afropop: Maranhão — Reggae Time Warp in Brazil", href: "http://afropop.org/articles/best-of-the-beat-on-afropop-maranhao-reggae-time-warp-in-brazil" },
    ],
  },
  {
    heading: "The Beat Magazine",
    items: [
      { label: "Bob Andy: Too Experienced", href: "https://s.reggaefever.ch/rkr/doc/Beat14-6-BobAndy.pdf" },
      { label: "Count Machuki: Hip to the Jive and Stay Alive!", href: "https://s.reggaefever.ch/rkr/doc/Beat15-4-Machuki.pdf" },
      { label: "Ernest Ranglin: Bass Is the Place", href: "https://s.reggaefever.ch/rkr/doc/Beat15-6-ErnestRanglin.pdf" },
      { label: "Donald Manning", href: "https://s.reggaefever.ch/rkr/doc/Beat16-2-DonaldManning.pdf" },
      { label: "Keith Scott (Rhino Records): Present at the Creation", href: "https://s.reggaefever.ch/rkr/doc/Beat16-2-RhinoScotty.pdf" },
      { label: "Keith Scott (Rhino Records): Get Ready — Rock Steady", href: "https://s.reggaefever.ch/rkr/doc/Beat16-4-Rocksteady.pdf" },
      { label: "Dave Barker: I Am the Magnificent", href: "https://s.reggaefever.ch/rkr/doc/Beat16-5-DaveBarker.pdf" },
      { label: "Derrick Morgan: The Conquering Ruler", href: "https://s.reggaefever.ch/rkr/doc/Beat17-2-DerrickMorgan.pdf" },
      { label: "Roy Shirley: Your Best Friend", href: "https://s.reggaefever.ch/rkr/doc/Beat17-3-RoyShirley.pdf" },
      { label: "Vernon Buckley (Maytones): Man Feels Sweet, Rocking on the GG's Beat", href: "https://s.reggaefever.ch/rkr/doc/Beat17-4-Maytones.pdf" },
      { label: "Winston Francis: My Name Is Fix-It", href: "https://s.reggaefever.ch/rkr/doc/Beat18-1-WinstonFrancis.pdf" },
      { label: "BB Seaton: Roots With Quality", href: "https://s.reggaefever.ch/rkr/doc/Beat22-2-Seaton.pdf" },
      { label: "Sounds Almighty — 40 Tunes In Tribute To Mr. Dodd", href: "https://s.reggaefever.ch/rkr/doc/Beat23-6-MrDodd.pdf" },
      { label: "The Maranhão Version", href: "https://s.reggaefever.ch/rkr/doc/Beat26-1-Maranhao.pdf" },
    ],
  },
  {
    heading: "Michael Turner Interview",
    items: [
      { label: "Doctor Sapatoo Diagnoses His Reggae Addiction", href: "https://theava.com/archives/43043" },
    ],
  },
];

export default function InterviewsPage() {
  return (
    <ProsePage title="Interviews and Features" intro="Interviews by Mike Turner">
      {SECTIONS.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <ul className="space-y-1.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <a href={item.href} target="_blank" rel="noopener noreferrer">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </ProsePage>
  );
}
