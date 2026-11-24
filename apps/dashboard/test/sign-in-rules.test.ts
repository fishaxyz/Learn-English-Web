import { describe, expect, it } from "vitest";
import { decideSignIn, NOT_INVITED, UNVERIFIED } from "../lib/sign-in-rules";

describe("who may sign in", () => {
  it("email link: same answer for invited and uninvited when asking, so nothing leaks", () => {
    expect(decideSignIn({ provider: "nodemailer", requestingLink: true, email: "a@x.test", invited: true })).toBe(true);
    expect(decideSignIn({ provider: "nodemailer", requestingLink: true, email: "b@x.test", invited: false })).toBe(
      "/sign-in/check-email"
    );
    expect(decideSignIn({ provider: "nodemailer", requestingLink: false, email: "b@x.test", invited: false })).toBe(
      false
    );
  });

  it("Google: needs a verified address that was invited", () => {
    const google = { provider: "google", requestingLink: false, email: "a@gmail.test" };
    expect(decideSignIn({ ...google, emailVerified: true, invited: true })).toBe(true);
    expect(decideSignIn({ ...google, emailVerified: true, invited: false })).toBe(NOT_INVITED);
    expect(decideSignIn({ ...google, emailVerified: false, invited: true })).toBe(UNVERIFIED);
    expect(decideSignIn({ ...google, emailVerified: null, invited: true })).toBe(UNVERIFIED);
  });

  it("refuses any provider that wasn't deliberately added", () => {
    expect(
      decideSignIn({ provider: "github", requestingLink: false, email: "a@x.test", emailVerified: true, invited: true })
    ).toBe(false);
  });
});
