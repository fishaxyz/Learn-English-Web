/**
 * Development sign-in: one click, no password, for invited accounts, on this computer only.
 * Allowed only when APP_ENV is development AND the dashboard's own address is localhost, so a live site can
 * never offer it even if APP_ENV were set wrongly. The server checks this again on every use.
 */
export function devModeAllowed(env: { APP_ENV: string; AUTH_URL: string }): boolean {
  if (env.APP_ENV !== "development") return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.AUTH_URL).hostname);
  } catch {
    return false;
  }
}
