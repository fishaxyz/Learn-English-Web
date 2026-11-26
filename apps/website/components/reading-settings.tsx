/** The reading page's left panel: settings for the reading view. Empty for now; controls come later. */
export function ReadingSettings() {
  return (
    <section
      aria-labelledby="reading-settings-heading"
      className="flex min-h-64 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 font-sans"
    >
      <h2 id="reading-settings-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">
        Reading settings
      </h2>
      <p className="text-sm text-muted">Settings for the reading view will appear here.</p>
    </section>
  );
}
