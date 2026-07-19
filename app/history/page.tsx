import type { Metadata } from "next";
import ProsePage from "@/components/ProsePage";

export const metadata: Metadata = {
  title: "History of RKR — Roots Knotty Roots",
  description:
    "The history of Roots Knotty Roots and an acknowledgement of the many collectors and contributors who helped build the discography.",
};

const CONTRIBUTORS = [
  "Al Kaatz", "Andre Van De Sande", "Andrew Lee", "Andrew Napoles", "Andrew Rush",
  "Andy Lambourn", "Arnaud", "BB Seaton", "Benja Murphy", "BigJohn VeteranSelectah",
  "Bob Brooks", "Bovell Walker", "Brad Klein", "Brian Kelson", "Brian Keyo",
  "Carl Finlay", "Carter Van Pelt", "CC Smith", "Charlie Morgan", "Chris Child",
  "Chris Guttmacher", "Chris Lane", "Christoph Strobl", "Clive Chin", "Cornel Campbell",
  "Craig Watson", "Dan Neeley", "Daniel Delang", "Danroy Wilson", "Dave “Studio 1” Allard",
  "David “Dro” Ostrowe", "David Katz", "David Kingston", "Delroy Beckford", "Deroy Wood",
  "Donald Manning", "Drayton Lumumba Chandell", "Dudley Sibley", "Dwight Pinkney", "Earl Hayles",
  "Elliott Leib", "Enrico Carbonere", "Felix Ruhling", "Fred Jakobin", "Gabriel Fuentes",
  "Gary Colyer", "Geoff Elkington", "Gianni Lima", "Greg Abramson", "Greg Chekroun",
  "Greg Lawson", "Guillaume Bogard", "Hank Holmes", "Hans Geboers", "Harri Olin",
  "Heather Augustin", "Henrik Anderson", "Holger Lorenz", "Ian Causer", "Ishancup",
  "Ismail Marc.", "J M Atherton", "Jeremy Collingwood", "Jimmy Becker", "Joakim Kalcidis",
  "Johan Lindgren", "Johan Sundberg", "John Cowley", "John Foster", "John Knott",
  "John Reiland", "Juha Vaahtera", "Jurjen Borregaard", "Kaz Uzuma", "Keith Scott",
  "Ken Bilby", "Ken Parker", "Kevin Mandel", "Kevin McMullen", "Kjell Hagermo",
  "Larry Hacken", "Laurence Cane-Honeysett", "Laurent Pfeiffer", "Leroy Pierson", "Lion Vibes",
  "Lloyd Dewar (Mohair Slim)", "Lloyd Miller", "Lord Creator", "Lorenzo Albini", "Lucas Corthesy",
  "Lucien Sulloway", "Luke Ehrlich", "Mark Gorney", "Mark Griffiths", "Mark Grobman",
  "Mark Harris", "Markus Vogel", "Martin Engel", "Matt Dinsmore", "Matt Johnson",
  "Matthew Christie", "Michael de Koningh", "Michael Garnice", "Mick Sleeper", "Mike Atherton",
  "Mike Davis", "Mike Murphy", "Minoru Tomita (Tommy Far East)", "Moss Raxlen", "Nick Bowman",
  "Nick Price", "Nicolas Potier", "Olivier Albot", "Patsy Todd", "Paul Coote",
  "Paul Davis", "Paul Steward", "Penny Reel", "Pete Fontana", "Pete Ware",
  "Peter Dalton", "Peter Ravheden", "Peter Roth", "Phil Chen", "Phil Etgart",
  "Ralf Koppelkamp", "Ray Hurford", "Richard Noblett", "Rikoh Delamuerte", "Rob Chapman",
  "Roberto Moore", "Roger Dalke", "Roger Steffens", "Rolf Cox", "Roy Black",
  "Roy Shirley", "Russ Bell-Brown", "Sam Mitchell", "Simon Czech", "Simon Maverick Buckland",
  "Sir Lueck", "Stephen Harrington", "Stephen Ricketts", "Steve Barrow", "Steve Lindley",
  "Steve Procter", "Steve Rice", "Steve Termeer", "Tapir", "Ted Singer",
  "Tim “Dancecrasher” Paine", "Tim Bradley", "Tim Harris", "Toby Gohn", "Todd Campbell",
  "Tomas Lundberg", "Tony Rounce", "Vernon Buckley", "Vijay Mohan", "Vince Ellis",
  "Vincent King Edwards", "Whitey Norton", "Winston Francis",
];

export default function HistoryPage() {
  return (
    <ProsePage title="History of Roots Knotty Roots">
      <p>
        Now in its fourth decade, Roots Knotty Roots is a research collaboration that began in
        book form and now exists as an online, comprehensive, and precise discography of
        Jamaican singles &mdash; over 130,000 listings and counting. Michael Turner continues
        as original author, in partnership with the collectors and researchers who keep the
        project alive.
      </p>
      <p>
        The main contributor was the late Bob Schoenfeld, who began this project with Michael
        Turner almost 25 years ago. Bob was an untiring music enthusiast and his research
        permeates RKR. Since his passing in 2006, RKR has more than tripled its content, in
        part thanks to the many collectors who continue to send information.
      </p>
      <p>
        Unfortunately many names have been lost over time, but we would like to thank the
        following contributors:
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
