import "server-only";
import { ApiError, createApiClient, type AnyVariables, type ApiClient, type TypedDocumentNode } from "@english/graphql";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "./env";

let client: ApiClient | undefined;
const api = () => (client ??= createApiClient(serverEnv().GRAPHQL_API_URL));

/**
 * The signed-in editor's session token, forwarded to the API as a Bearer token. It stays on this server: the
 * browser's copy is an HttpOnly cookie that scripts can't read, and the API is never called from the browser.
 */
async function sessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("__Secure-authjs.session-token")?.value ?? jar.get("authjs.session-token")?.value ?? null;
}

async function headers(siteDomain?: string) {
  const token = await sessionToken();
  if (!token) redirect("/sign-in");
  return { authorization: `Bearer ${token}`, ...(siteDomain ? { "x-site-domain": siteDomain } : {}) };
}

/** An editor's query: never cached, always as the signed-in user. Signs out to the sign-in page if needed. */
export async function editorQuery<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
  variables: Variables,
  siteDomain?: string
): Promise<Data> {
  try {
    return await api().query(document, variables, { headers: await headers(siteDomain), cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    throw error;
  }
}

export async function editorMutation<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
  variables: Variables,
  siteDomain?: string
): Promise<Data> {
  return api().mutation(document, variables, { headers: await headers(siteDomain), cache: "no-store" });
}

export { ApiError };

/** Words for the API's error codes, for editors. */
export function explain(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "CONFLICT":
      case "VALIDATION_ERROR":
        return error.message;
      case "FORBIDDEN":
        return "Your role on this site can't do that.";
      case "NOT_FOUND":
        return "That lesson no longer exists, or isn't on your site.";
      case "UNAUTHENTICATED":
        return "Your session has ended. Sign in again.";
      case "RATE_LIMITED":
        return "Too many requests. Wait a minute and try again.";
    }
  }
  return "Something went wrong. Try again in a moment.";
}
