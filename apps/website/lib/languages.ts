/** A language's English name ("vi" → "Vietnamese"), or the code itself when the browser doesn't know it. */
export const languageName = (locale: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
};
