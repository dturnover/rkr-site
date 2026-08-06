import Image from "next/image";

// The 1961 Federal Studio control-room photograph, shown as a mounted print on
// the home page.
//
// Capped at 34rem rather than filling the column: the source is a scan of a
// printed page (1070px on its longest edge is all the detail there is), so
// blowing it wider would just magnify the halftone. At this size it renders
// around 2x on a retina screen and stays crisp. The cap is in rem, so it grows
// with the large-monitor root font scaling in globals.css.
//
// The caption is real text rather than the caption strip printed under the
// original scan — sharper, selectable, and read correctly by screen readers.
export default function StudioPhoto() {
  return (
    <figure className="mx-auto max-w-[34rem]">
      <div className="frame-double bg-paper p-2 sm:p-3">
        <Image
          src="/federal-studio-1961.jpg"
          alt="Six men around a mixing desk and turntable in a small studio control room: Roland Alphonso, Clancy Eccles, Don Drummond in a hat, Clement “Coxsone” Dodd in a cap, Desmond Elliott and Herman Sang, photographed at Federal Studio in 1961."
          width={1070}
          height={854}
          sizes="(min-width: 640px) 34rem, 100vw"
          className="w-full h-auto"
        />
      </div>
      <figcaption className="mt-3 font-body text-xs sm:text-sm text-ink-soft text-center leading-snug">
        Roland Alphonso, Clancy Eccles, Don Drummond (with hat), Clement &ldquo;Coxsone&rdquo; Dodd
        (with cap), Desmond Elliott, and Herman Sang in 1961 in the control room of Federal Studio.
      </figcaption>
    </figure>
  );
}
