import { Client, fetchExchange, type AnyVariables, type TypedDocumentNode } from "@urql/core";

/** An error the API reported with one of its codes (AGENTS.md §6), or UNEXPECTED for anything else. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type RequestOptions = {
  headers?: Record<string, string>;
  /** Next.js data-cache options for this request (tags to revalidate on publish, a refresh interval). */
  next?: { tags?: string[]; revalidate?: number | false };
  cache?: "default" | "no-store" | "reload" | "no-cache" | "force-cache" | "only-if-cached";
};

/**
 * The typed client both Next.js apps use, on their servers only: one urql client, no client-side cache (Next's
 * data cache is the cache), every call typed by the generated documents.
 */
export function createApiClient(apiUrl: string) {
  const client = new Client({
    url: new URL("/graphql", apiUrl).toString(),
    exchanges: [fetchExchange],
    requestPolicy: "network-only",
    preferGetMethod: false,
  });

  async function run<Data, Variables extends AnyVariables>(
    kind: "query" | "mutation",
    document: TypedDocumentNode<Data, Variables>,
    variables: Variables,
    options: RequestOptions = {}
  ): Promise<Data> {
    const context = {
      fetchOptions: {
        headers: options.headers ?? {},
        ...(options.cache ? { cache: options.cache } : {}),
        ...(options.next ? { next: options.next } : {}),
      } as RequestInit,
    };
    const result = await (
      kind === "query" ? client.query(document, variables, context) : client.mutation(document, variables, context)
    ).toPromise();
    if (result.error) {
      const first = result.error.graphQLErrors[0];
      const code =
        typeof first?.extensions?.["code"] === "string" ? (first.extensions["code"] as string) : "UNEXPECTED";
      throw new ApiError(code, first?.message ?? "The API couldn't be reached");
    }
    if (!result.data) throw new ApiError("UNEXPECTED", "The API returned no data");
    return result.data;
  }

  return {
    query: <Data, Variables extends AnyVariables>(
      document: TypedDocumentNode<Data, Variables>,
      variables: Variables,
      options?: RequestOptions
    ) => run("query", document, variables, options),
    mutation: <Data, Variables extends AnyVariables>(
      document: TypedDocumentNode<Data, Variables>,
      variables: Variables,
      options?: RequestOptions
    ) => run("mutation", document, variables, options),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
