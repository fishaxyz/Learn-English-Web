import {
  GraphQLError,
  Kind,
  NoSchemaIntrospectionCustomRule,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationRule,
} from "graphql";
import type { Plugin } from "graphql-yoga";

/** Limits on what one request may ask for (AGENTS.md §6). Checked before anything runs. */
export const LIMITS = { depth: 10, aliases: 20, bodyBytes: 100_000 };

const tooMuch = (message: string) => new GraphQLError(message, { extensions: { code: "VALIDATION_ERROR" } });

/** Rejects operations nested deeper than `max` fields, following fragments (and ignoring fragment cycles). */
export function depthLimit(max: number): ValidationRule {
  return (context) => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const d of context.getDocument().definitions) {
      if (d.kind === Kind.FRAGMENT_DEFINITION) fragments.set(d.name.value, d);
    }
    const depthOf = (set: SelectionSetNode, depth: number, seen: ReadonlySet<string>): number => {
      let deepest = depth;
      for (const sel of set.selections) {
        if (sel.kind === Kind.FIELD && sel.selectionSet) {
          deepest = Math.max(deepest, depthOf(sel.selectionSet, depth + 1, seen));
        } else if (sel.kind === Kind.INLINE_FRAGMENT) {
          deepest = Math.max(deepest, depthOf(sel.selectionSet, depth, seen));
        } else if (sel.kind === Kind.FRAGMENT_SPREAD && !seen.has(sel.name.value)) {
          const fragment = fragments.get(sel.name.value);
          if (fragment)
            deepest = Math.max(deepest, depthOf(fragment.selectionSet, depth, new Set([...seen, sel.name.value])));
        }
        if (deepest > max) return deepest; // no need to look further
      }
      return deepest;
    };
    return {
      OperationDefinition(node) {
        const depth = depthOf(node.selectionSet, 1, new Set());
        if (depth > max) context.reportError(tooMuch(`The query is too deep (more than ${max} levels)`));
      },
    };
  };
}

/** Rejects documents using more than `max` aliases (a cheap way to multiply expensive fields). */
export function aliasLimit(max: number): ValidationRule {
  return (context) => {
    let count = 0;
    return {
      Field(node) {
        if (node.alias && ++count === max + 1) context.reportError(tooMuch(`Too many aliases (more than ${max})`));
      },
    };
  };
}

export function useLimits(options: { production: boolean }): Plugin {
  return {
    onValidate({ addValidationRule }) {
      addValidationRule(depthLimit(LIMITS.depth));
      addValidationRule(aliasLimit(LIMITS.aliases));
      // The schema is no secret, but there's no reason to hand it to scrapers in production.
      if (options.production) addValidationRule(NoSchemaIntrospectionCustomRule);
    },
  };
}
