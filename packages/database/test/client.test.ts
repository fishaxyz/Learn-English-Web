import { describe, expect, it } from "vitest";
import { createDatabase } from "../src";

describe("createDatabase", () => {
  it("ping says false, without throwing, when nothing is listening", async () => {
    // Port 1 on localhost: nothing listens there, so the connection is refused at once.
    const database = createDatabase("postgres://nobody@127.0.0.1:1/none", { max: 1 });
    await expect(database.ping(1000)).resolves.toBe(false);
    await database.close();
  });
});
