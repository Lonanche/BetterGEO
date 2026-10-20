/** Keep API order while dropping invalid or duplicate ISO-shaped codes. */
export function countryCodes(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('Unexpected country statistics.');
  return [
    ...new Set(
      value
        .filter((code): code is string => typeof code === 'string' && /^[a-z]{2}$/i.test(code))
        .map((code) => code.toLowerCase()),
    ),
  ];
}
let regionNames: Intl.DisplayNames | undefined, regionLocale: string | undefined;
export function countryName(code: string) {
  try {
    const locale = document.documentElement.lang || navigator.language || 'en';
    if (locale !== regionLocale) {
      regionNames = new Intl.DisplayNames([locale], { type: 'region' });
      regionLocale = locale;
    }
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
