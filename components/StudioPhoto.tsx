import Image from "next/image";

// A historic photo mounted in the empty parchment to the LEFT of the masthead.
//
// It's absolutely positioned so it occupies space the banner never used and
// adds no height to the header — the centred banner and search form are
// untouched. Hidden below xl: under ~1280px there simply isn't room beside the
// banner, and squeezing it in would either overlap the title or push the
// layout around on the phones/laptops the site is mostly read on.
export default function StudioPhoto() {
  return (
    <figure className="hidden xl:block absolute left-4 2xl:left-8 top-5 w-40 2xl:w-52 z-10">
      {/* Thin frame + paper mount, so the scan reads as a mounted print rather
          than a floating image on the parchment. */}
      <div className="border-2 border-frame bg-paper p-1.5">
        <Image
          src="/federal-studio-1961.jpg"
          alt="Roland Alphonso, Clancy Eccles, Don Drummond, Clement “Coxsone” Dodd, Desmond Elliott and Herman Sang in the control room of Federal Studio, 1961."
          width={900}
          height={718}
          className="w-full h-auto"
          priority={false}
        />
      </div>
      <figcaption className="mt-1.5 font-body text-[0.65rem] leading-snug text-ink-soft">
        Roland Alphonso, Clancy Eccles, Don Drummond (with hat), Clement &ldquo;Coxsone&rdquo; Dodd
        (with cap), Desmond Elliott, and Herman Sang in 1961 in the control room of Federal Studio.
      </figcaption>
    </figure>
  );
}
