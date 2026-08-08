import type { Metadata } from "next";
import ProsePage from "@/components/ProsePage";

export const metadata: Metadata = {
  title: "Acknowledgements — Roots Knotty Roots",
  description:
    "Acknowledgements for Roots Knotty Roots — the many collectors and contributors who helped build the discography.",
};

const CONTRIBUTORS = [
  "Adam Tadesse", "Al Kaatz", "Andre Van De Sande", "Andrea Novani", "Andrew Lee",
  "Andrew Napoles", "Andrew Rush", "Andy Lambourn", "Arnaud", "BB Seaton",
  "Benja Murphy", "BigJohn VeteranSelectah", "Bob Andy", "Bob Brooks", "Bovell Walker",
  "Brad Klein", "Brian Kelson", "Brian Keyo", "Buster Brakus", "Carl Finlay",
  "Carl Piccione", "Carter Van Pelt", "CC Smith", "Charlie Morgan", "Chris Child",
  "Chris Guttmacher", "Chris Lane", "Christoph Strobl", "Clinton Rufus", "Clive Chin",
  "Cornel Campbell", "Craig Watson", "Dan Neeley", "Daniel Delang", "Danroy Wilson",
  "Dario Smagata-Bryan", "Dave “Studio 1” Allard", "David “Dro” Ostrowe", "David Katz", "David Kingston",
  "Desmond Turner", "Delroy Beckford", "Deroy Wood", "Donald Manning", "Drayton Lumumba Chandell",
  "Dudley Sibley", "Dwight Pinkney", "Earl Hayles", "Elliott Leib", "Enrico Carbonere",
  "Eric Bussel", "Eric Doumerc", "Ernest Ranglin", "Felix Ruhling", "Fred Jakobin",
  "Gabriel Fuentes", "Gary Colyer", "Geoff Elkington", "Gianni Lima", "Greg Abramson",
  "Greg Chekroun", "Greg Lawson", "Guillaume Bogard", "Hank Holmes", "Hans Geboers",
  "Harri Olin", "Heather Augustin", "Henrik Anderson", "Holger Lorenz", "Ian Causer",
  "Ismail Marc", "J M Atherton", "Jake Travis", "Jeremy Collingwood", "Jeremy Freeman",
  "Jim Boss", "Jimmy Becker", "Jimmy Hori", "Joakim Kalcidis", "Johan Lindgren",
  "Johan Sundberg", "John Cowley", "John Foster", "John Knott", "John Reilan",
  "Juha Vaahtera", "Jumbo Shower", "Jurjen Borregaard", "Kaz Uzuma", "Keith Scott",
  "Ken Bilby", "Ken Parker", "Kevin Mandel", "Kevin McMullen", "Kjell Hagermo",
  "Larry Hacken", "Laurence Cane-Honeysett", "Laurent Pfeiffer", "Leroy Pierson", "Lion Vibes",
  "Lloyd Dewar (Mohair Slim)", "Lloyd Miller", "Lord Creator", "Lorenzo Albini", "Lucas Corthesy",
  "Lucien Sulloway", "Luke Ehrlich", "Manuel Tabone", "Mark Gorney", "Mark Griffiths",
  "Mark Harris", "Markus Vogel", "Martin Engel", "Matt Dinsmore", "Matt Johnson",
  "Matthew Christie", "Michael de Koningh", "Michael Garnice", "Michael Hodgson", "Michael Murphy",
  "Mick Sleeper", "Mike Atherton", "Mike Davis", "Mike Murphy", "Minoru Tomita (Tommy Far East)",
  "Moss Raxlen", "Nat Birchall", "Nelson Meirelles", "Nick Bowman", "Nick Price",
  "Nicolas Legendre", "Nicolas Potier", "Olivier Albot", "Otavio Rodrigues", "Patsy Todd",
  "Paul Coote", "Paul Davis", "Paul Steward", "Pete Fontana", "Pete Ware",
  "Peter Austin", "Peter Dalton", "Peter Ravheden", "Peter Roth", "Phil Chen",
  "Phil Etgart", "Ralf Koppelkamp", "Rangan Momen", "Ray Hurford", "Rich Lowe",
  "Richard Noblett", "Rikoh Delamuerte", "Rob Chapman", "Robert Spellman", "Roberto Moore",
  "Robin Latour", "Roger Dalke", "Rolf Cox", "Roy Black", "Roy Shirley",
  "Russ Bell-Brown", "Sam Mitchell", "Simon Czech", "Simon Maverick Buckland", "Sir Lueck",
  "Stephen Harrington", "Stephen Ricketts", "Steve Barrow", "Steve Lindley", "Steve Procter",
  "Steve Rice", "Steve Termeer", "Tapir", "Ted Singer", "Thore Staeck",
  "Tim Paine", "Tim Bradley", "Tim Harris", "Toby Gohn", "Todd Campbell",
  "Tomas Lundberg", "Tony Rounce", "Vernon Buckley", "Vijay Mohan", "Vince Ellis",
  "Vincent King Edwards", "Whitey Norton", "Winston Francis",
];

export default function HistoryPage() {
  return (
    <ProsePage title="Acknowledgements">
      <p>
        Begun in 1991, Roots Knotty Roots is a research project that first appeared in book form
        and now exists as an online database. It is a comprehensive discography of Jamaican
        singles containing more than 135,000 listings. Michael Turner continues as founding
        author, in collaboration with the many collectors and researchers who have helped keep
        this project alive.
      </p>
      <p>
        RKR was initially inspired by the work of Charlie Morgan, whose <em>Coxson&rsquo;s Music</em>{" "}
        was the first published discography of Jamaican records. Building on Charlie&rsquo;s
        pioneering work, I was later joined by the late Bob Schoenfeld, who became the driving
        force behind the Roots Knotty Roots book editions. Charlie and Bob have since passed away,
        but their many contributions to Jamaican music should not be forgotten.
      </p>
      <p>
        As the database continued to grow, Roots Knotty Roots eventually became too large for
        publication in book form. Since 2012, it has existed as a subscription website. Now,
        thanks to the work of my son, Desmond Turner, it has its own dedicated website and is now
        freely available to everyone.
      </p>
      <p>
        Roots Knotty Roots exists in large part due to the contributions of many people.
        Unfortunately, some names have been lost over time, but we would like to thank the
        following:
      </p>

      <ul className="columns-2 sm:columns-3 gap-x-8 text-sm text-ink-soft [column-fill:_balance] mt-2">
        {CONTRIBUTORS.map((name) => (
          <li key={name} className="break-inside-avoid py-0.5">
            {name}
          </li>
        ))}
      </ul>
    </ProsePage>
  );
}
