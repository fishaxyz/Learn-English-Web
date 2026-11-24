import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { typeDefs } from "../src";

describe("schema", () => {
  it("builds and exposes the health query", () => {
    const schema = buildSchema(typeDefs);
    expect(schema.getQueryType()?.getFields()["health"]).toBeDefined();
  });
});
