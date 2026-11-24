import { schema, type Database } from "@english/database";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { invalid, notFound } from "../../errors";
import { one } from "../../rows";
import type { ExerciseSetModel } from "../../models";
import { grade, GRADING_VERSION, type Correct } from "./grading";
import { checkConsistency, exerciseSetInput, grading, QUESTION_SCHEMA_VERSION, type ExerciseSetInput } from "./schemas";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

/** Writes exercise sets onto a (draft) revision. Validates every question first; writes nothing if one is bad. */
export async function addExerciseSets(tx: Tx, siteId: string, revisionId: string, sets: ExerciseSetInput[]) {
  const parsed = sets.map((raw, s) => {
    const result = exerciseSetInput.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw invalid(`Exercise set ${s + 1}: ${issue?.path.join(".")} ${issue?.message}`);
    }
    result.data.questions.forEach((q, i) => {
      const problem = checkConsistency(q);
      if (problem) throw invalid(`Exercise set ${s + 1}, question ${i + 1}: ${problem}`);
    });
    return result.data;
  });
  for (const [position, set] of parsed.entries()) {
    const row = one(
      await tx
        .insert(schema.exerciseSets)
        .values({ siteId, revisionId, title: set.title, instructions: set.instructions ?? null, position })
        .returning({ id: schema.exerciseSets.id })
    );
    for (const [qPos, q] of set.questions.entries()) {
      const question = one(
        await tx
          .insert(schema.questions)
          .values({
            siteId,
            exerciseSetId: row.id,
            type: q.type,
            position: qPos,
            points: q.points,
            promptJson: q.prompt,
            schemaVersion: QUESTION_SCHEMA_VERSION,
          })
          .returning({ id: schema.questions.id })
      );
      if (q.type === "SINGLE_CHOICE") {
        await tx
          .insert(schema.questionOptions)
          .values(q.options.map((content, i) => ({ questionId: question.id, content, position: i })));
      }
      await tx.insert(schema.answerKeys).values({
        questionId: question.id,
        gradingJson: q.grading,
        explanation: q.explanation ?? null,
        gradingVersion: GRADING_VERSION,
      });
    }
  }
}

/** Replaces all of a draft's exercises (the frozen-revision trigger refuses this for published ones). */
export async function replaceExerciseSets(tx: Tx, siteId: string, revisionId: string, sets: ExerciseSetInput[]) {
  await tx.delete(schema.exerciseSets).where(eq(schema.exerciseSets.revisionId, revisionId));
  await addExerciseSets(tx, siteId, revisionId, sets);
}

/** A revision's exercises in the shape editors write them (answer keys included): editorial use only. */
export async function exerciseSetsForEditing(db: Db, revisionId: string): Promise<ExerciseSetInput[]> {
  const sets = await db
    .select()
    .from(schema.exerciseSets)
    .where(eq(schema.exerciseSets.revisionId, revisionId))
    .orderBy(asc(schema.exerciseSets.position));
  const out: ExerciseSetInput[] = [];
  for (const set of sets) {
    const qs = await db
      .select({ question: schema.questions, key: schema.answerKeys })
      .from(schema.questions)
      .innerJoin(schema.answerKeys, eq(schema.answerKeys.questionId, schema.questions.id))
      .where(eq(schema.questions.exerciseSetId, set.id))
      .orderBy(asc(schema.questions.position));
    const questions = [];
    for (const { question, key } of qs) {
      const options = await db
        .select({ content: schema.questionOptions.content })
        .from(schema.questionOptions)
        .where(eq(schema.questionOptions.questionId, question.id))
        .orderBy(asc(schema.questionOptions.position));
      questions.push({
        type: question.type,
        points: question.points,
        prompt: question.promptJson,
        ...(question.type === "SINGLE_CHOICE" ? { options: options.map((o) => o.content) } : {}),
        grading: key.gradingJson,
        ...(key.explanation ? { explanation: key.explanation } : {}),
      } as ExerciseSetInput["questions"][number]);
    }
    out.push({ title: set.title, ...(set.instructions ? { instructions: set.instructions } : {}), questions });
  }
  return out;
}

/** Copies a revision's exercises (with their answer keys) onto a new draft, so the published ones stay frozen. */
export async function copyExerciseSets(tx: Tx, siteId: string, fromRevisionId: string, toRevisionId: string) {
  const sets = await tx
    .select()
    .from(schema.exerciseSets)
    .where(eq(schema.exerciseSets.revisionId, fromRevisionId))
    .orderBy(asc(schema.exerciseSets.position));
  for (const set of sets) {
    const copy = one(
      await tx
        .insert(schema.exerciseSets)
        .values({
          siteId,
          revisionId: toRevisionId,
          title: set.title,
          instructions: set.instructions,
          position: set.position,
        })
        .returning({ id: schema.exerciseSets.id })
    );
    const qs = await tx.select().from(schema.questions).where(eq(schema.questions.exerciseSetId, set.id));
    for (const q of qs) {
      const qCopy = one(
        await tx
          .insert(schema.questions)
          .values({ ...q, id: undefined, exerciseSetId: copy.id })
          .returning({ id: schema.questions.id })
      );
      const options = await tx.select().from(schema.questionOptions).where(eq(schema.questionOptions.questionId, q.id));
      if (options.length) {
        await tx
          .insert(schema.questionOptions)
          .values(options.map((o) => ({ questionId: qCopy.id, content: o.content, position: o.position })));
      }
      const [key] = await tx.select().from(schema.answerKeys).where(eq(schema.answerKeys.questionId, q.id));
      if (key) await tx.insert(schema.answerKeys).values({ ...key, questionId: qCopy.id });
    }
  }
}

/** An exercise set that learners may see: on this site, in a currently published revision of a live resource. */
export async function publishedExerciseSet(db: Db, siteId: string, id: string): Promise<ExerciseSetModel | null> {
  const [row] = await db
    .select({ set: schema.exerciseSets })
    .from(schema.exerciseSets)
    .innerJoin(
      schema.resourceLocalizations,
      eq(schema.resourceLocalizations.publishedRevisionId, schema.exerciseSets.revisionId)
    )
    .innerJoin(schema.resources, eq(schema.resources.id, schema.resourceLocalizations.resourceId))
    .where(
      and(eq(schema.exerciseSets.id, id), eq(schema.exerciseSets.siteId, siteId), isNull(schema.resources.archivedAt))
    )
    .limit(1);
  return row?.set ?? null;
}

export type PracticeAnswer = {
  questionId: string;
  optionId?: string | null;
  judgement?: "TRUE" | "FALSE" | "NOT_GIVEN" | null;
  gaps?: { gapId: string; text: string }[] | null;
};

export type CorrectAnswerResult =
  | { __typename: "ChoiceAnswer"; optionId: string }
  | { __typename: "JudgementAnswer"; judgement: "TRUE" | "FALSE" | "NOT_GIVEN" }
  | { __typename: "GapsAnswer"; gaps: { gapId: string; text: string }[] };

const LIMITS = { answers: 100, gaps: 50, text: 200 };

/**
 * Grades a learner's answers on the server (AGENTS.md §5.4). Reads the answer keys only here, after
 * submission. Unanswered questions score zero. Nothing is stored: MVP practice is anonymous.
 */
export async function gradePractice(db: Db, siteId: string, exerciseSetId: string, answers: PracticeAnswer[]) {
  if (answers.length > LIMITS.answers) throw invalid(`At most ${LIMITS.answers} answers`);
  const set = await publishedExerciseSet(db, siteId, exerciseSetId);
  if (!set) throw notFound("Exercise set");

  const qs = await db
    .select({ question: schema.questions, key: schema.answerKeys })
    .from(schema.questions)
    .innerJoin(schema.answerKeys, eq(schema.answerKeys.questionId, schema.questions.id))
    .where(eq(schema.questions.exerciseSetId, set.id))
    .orderBy(asc(schema.questions.position));
  const ids = qs.map((q) => q.question.id);
  const options = ids.length
    ? await db
        .select()
        .from(schema.questionOptions)
        .where(inArray(schema.questionOptions.questionId, ids))
        .orderBy(asc(schema.questionOptions.position))
    : [];
  const optionsOf = (questionId: string) => options.filter((o) => o.questionId === questionId);

  const byQuestion = new Map<string, PracticeAnswer>();
  for (const a of answers) {
    if (!ids.includes(a.questionId)) throw invalid("An answer is for a question outside this exercise set");
    if (byQuestion.has(a.questionId)) throw invalid("A question is answered twice");
    if ((a.gaps?.length ?? 0) > LIMITS.gaps) throw invalid("Too many gap answers");
    if (a.gaps?.some((g) => g.text.length > LIMITS.text))
      throw invalid(`Gap answers are at most ${LIMITS.text} characters`);
    byQuestion.set(a.questionId, a);
  }

  const results = qs.map(({ question, key }) => {
    const answer = byQuestion.get(question.id);
    const opts = optionsOf(question.id);
    const optionIndex = answer?.optionId ? opts.findIndex((o) => o.id === answer.optionId) : undefined;
    const graded = grade(
      grading.parse(key.gradingJson),
      {
        ...(optionIndex !== undefined && optionIndex >= 0 ? { optionIndex } : {}),
        ...(answer?.judgement ? { judgement: answer.judgement } : {}),
        ...(answer?.gaps ? { gaps: answer.gaps } : {}),
      },
      question.points
    );
    return {
      questionId: question.id,
      correct: graded.correct,
      awardedPoints: graded.awardedPoints,
      maxPoints: graded.maxPoints,
      explanation: key.explanation,
      correctAnswer: toResult(graded.answer, opts),
    };
  });

  return {
    exerciseSetId: set.id,
    score: results.reduce((sum, r) => sum + r.awardedPoints, 0),
    maxScore: results.reduce((sum, r) => sum + r.maxPoints, 0),
    questions: results,
  };
}

function toResult(answer: Correct, options: { id: string }[]): CorrectAnswerResult {
  switch (answer.kind) {
    case "choice":
      return { __typename: "ChoiceAnswer", optionId: options[answer.optionIndex]?.id ?? "" };
    case "judgement":
      return { __typename: "JudgementAnswer", judgement: answer.judgement };
    case "gaps":
      return { __typename: "GapsAnswer", gaps: answer.gaps };
  }
}
