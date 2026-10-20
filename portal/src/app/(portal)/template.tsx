/**
 * Remounts on every navigation, so each page arrives the same way: its blocks
 * fade in and rise a few pixels (globals.css, .page-enter). That is the page
 * transition; there is no exit animation to wait through.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
