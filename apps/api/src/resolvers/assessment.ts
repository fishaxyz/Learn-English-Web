import type { Resolvers } from "../generated/resolvers";
import { gapFill, singleChoice, trueFalseNotGiven } from "../modules/assessment/schemas";
import { gradePractice, publishedExerciseSet } from "../modules/assessment/service";

const TYPE_BY_QUESTION = {
  SINGLE_CHOICE: "SingleChoiceQuestion",
  TRUE_FALSE_NOT_GIVEN: "TrueFalseNotGivenQuestion",
  GAP_FILL: "GapFillQuestion",
} as const;

// Only learner-facing prompt fields exist on these types; answer keys live in another table and are read only
// by gradePractice.
export const assessmentResolvers: Resolvers = {
  Query: {
    exerciseSet: async (_, { id }, ctx) => publishedExerciseSet(ctx.db, (await ctx.site()).id, id),
  },
  Mutation: {
    gradePractice: async (_, { input }, ctx) => {
      ctx.limit("grade");
      return gradePractice(ctx.db, (await ctx.site()).id, input.exerciseSetId, input.answers);
    },
  },

  ExerciseSet: {
    questions: (s, _, ctx) => ctx.loaders.questionsBySet.load(s.id),
  },
  Question: { __resolveType: (q) => TYPE_BY_QUESTION[q.type] },
  SingleChoiceQuestion: {
    stem: (q) => singleChoice.prompt.parse(q.promptJson).stem,
    options: (q, _, ctx) => ctx.loaders.optionsByQuestion.load(q.id),
  },
  TrueFalseNotGivenQuestion: {
    statement: (q) => trueFalseNotGiven.prompt.parse(q.promptJson).statement,
  },
  GapFillQuestion: {
    segments: (q) => gapFill.prompt.parse(q.promptJson).segments,
  },
  GapFillSegment: {
    __resolveType: (s) => ("gapId" in s ? "GapSegment" : "TextSegment"),
  },
  CorrectAnswer: {
    __resolveType: (a) => ("optionId" in a ? "ChoiceAnswer" : "judgement" in a ? "JudgementAnswer" : "GapsAnswer"),
  },
};
