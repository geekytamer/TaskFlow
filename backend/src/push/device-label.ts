/**
 * A short name for a device from its browser's User-Agent, e.g. "iPhone · Safari".
 * Unknown or missing agents read "Browser".
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  const os = /iPhone|iPod/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
          : /Windows/.test(ua) ? 'Windows'
            : /CrOS/.test(ua) ? 'Chromebook'
              : /Linux/.test(ua) ? 'Linux'
                : null;
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
      : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
              : null;
  if (os && browser) return `${os} · ${browser}`;
  return os ?? browser ?? 'Browser';
}
