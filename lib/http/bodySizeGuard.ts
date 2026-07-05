// Fast-path rejection of oversized request bodies before we do any work
// (formData parsing, CSV decoding, etc). This checks the client-supplied
// Content-Length header, so it stops any normal browser/form submission
// immediately — but a deliberately adversarial client can omit
// Content-Length and stream an unbounded chunked body anyway; Node's raw
// HTTP layer has no simple built-in cutoff for that case. If this is ever
// deployed behind a reverse proxy (nginx, etc.), also set a hard cap there
// (e.g. client_max_body_size) as defense in depth.
export function isBodyTooLarge(request: Request, maxBytes: number): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return false;
  const size = parseInt(contentLength, 10);
  return Number.isFinite(size) && size > maxBytes;
}

export const LOGIN_BODY_MAX_BYTES = 8 * 1024; // password form is tiny
export const UPLOAD_BODY_MAX_BYTES = 300 * 1024 * 1024; // generous headroom over the ~23MB source CSV
