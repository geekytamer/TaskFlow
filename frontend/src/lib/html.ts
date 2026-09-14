/**
 * Escapes text for HTML built as a string, such as print windows written with
 * document.write. Those windows share the app's origin, so an unescaped record
 * name like `<img onerror=...>` would run with the signed-in user's session.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
