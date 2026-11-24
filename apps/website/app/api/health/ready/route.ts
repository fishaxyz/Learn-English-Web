import { serverEnv } from "../../../../lib/env";

// Readiness: this server can reach the API. Reports only up or down, never the API's address or errors.
export const dynamic = "force-dynamic";

export async function GET() {
  let api = false;
  try {
    const url = new URL("/health/ready", serverEnv().GRAPHQL_API_URL);
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    api = res.ok;
  } catch {
    api = false;
  }
  return Response.json(
    { status: api ? "ok" : "unavailable", api: api ? "ok" : "down" },
    { status: api ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
