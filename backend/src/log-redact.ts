/** Request URLs are logged; secrets that ride in them (action tokens, push endpoints) must not be. */
export function redactUrl(url: string): string {
  return url
    .replace(/(\/push-actions\/)[^/?#]+/g, '$1[redacted]')
    .replace(/([?&]endpoint=)[^&#]*/g, '$1[redacted]');
}
