// Twitter/X uses the same card as Open Graph. Re-export the opengraph-image
// route so both <meta name="twitter:image"> and <meta property="og:image">
// resolve to one generated card, with no duplicated drawing code.
export { default, alt, size, contentType } from "./opengraph-image";
