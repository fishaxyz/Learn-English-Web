import { GraphQLError, GraphQLScalarType, Kind, valueFromASTUntyped } from "graphql";

const bad = (message: string) => new GraphQLError(message, { extensions: { code: "VALIDATION_ERROR" } });

export const DateTime = new GraphQLScalarType<Date, string>({
  name: "DateTime",
  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
    throw bad("DateTime must be a date");
  },
  parseValue(value) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw bad("DateTime must be an ISO 8601 string");
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING || Number.isNaN(Date.parse(ast.value)))
      throw bad("DateTime must be an ISO 8601 string");
    return new Date(ast.value);
  },
});

/** Passed through as JSON; every write path validates it with parseRichText before storing. */
export const RichText = new GraphQLScalarType<unknown, unknown>({
  name: "RichText",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => valueFromASTUntyped(ast),
});
