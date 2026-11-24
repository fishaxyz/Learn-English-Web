"use server";

import { GradePracticeDocument } from "@english/graphql";
import type { Answer, GradeResult } from "@english/ui";
import { headers } from "next/headers";
import { ApiError, visitorMutation } from "../../../lib/api";

const INVALID = "Some answers couldn't be read. Check them and try again.";

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: "You've checked a lot of answers in a short time. Wait a minute, then try again.",
  NOT_FOUND: "These exercises have changed. Reload the page to get the latest version.",
  VALIDATION_ERROR: INVALID,
};

/** Grades on the API, never in the browser: the browser only ever sees the result (AGENTS.md §5.4). */
export async function gradeExercises(exerciseSetId: string, answers: Answer[]): Promise<GradeResult> {
  if (typeof exerciseSetId !== "string" || !Array.isArray(answers) || answers.length > 100) {
    return { ok: false, message: INVALID };
  }
  const h = await headers();
  const visitor = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  try {
    const data = await visitorMutation(GradePracticeDocument, { input: { exerciseSetId, answers } }, visitor ?? null);
    return { ok: true, result: data.gradePractice };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "UNEXPECTED";
    return { ok: false, message: MESSAGES[code] ?? "Something went wrong while checking. Try again in a moment." };
  }
}
