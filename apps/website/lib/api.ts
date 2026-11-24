import "server-only";
import { ApiError, createApiClient, type AnyVariables, type ApiClient, type TypedDocumentNode } from "@english/graphql";
import { serverEnv } from "./env";

let client: ApiClient | undefined;
const api = () => (client ??= createApiClient(serverEnv().GRAPHQL_API_URL));

/** Public pages refresh at least this often, even if a publish notice is missed. */
export const REFRESH_SECONDS = 300;

/** A cached public query, tagged so a publish can refresh it (the same tags the API sends). */
export function publicQuery<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
  variables: Variables,
  tags: string[] = ["resources"]
): Promise<Data> {
  return api().query(document, variables, {
    headers: { "x-site-domain": serverEnv().SITE_DOMAIN },
    next: { tags, revalidate: REFRESH_SECONDS },
  });
}

/** An uncached call made for one visitor (grading), passing their address on for rate limits. */
export function visitorMutation<Data, Variables extends AnyVariables>(
  document: TypedDocumentNode<Data, Variables>,
  variables: Variables,
  visitorIp: string | null
): Promise<Data> {
  return api().mutation(document, variables, {
    headers: { "x-site-domain": serverEnv().SITE_DOMAIN, ...(visitorIp ? { "x-forwarded-for": visitorIp } : {}) },
    cache: "no-store",
  });
}

export { ApiError };

export const tagForLesson = (kind: string, slug: string) => `resource:${kind}:${slug}`;
