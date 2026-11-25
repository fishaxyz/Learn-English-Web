import type { Resolvers } from "../generated/resolvers";
import {
  completion,
  gapFill,
  matching,
  multipleChoice,
  shortAnswer,
  singleChoice,
  trueFalseNotGiven,
  yesNoNotGiven,
} from "../modules/assessment/schemas";
import { gradePractice, publishedExerciseSet } from "../modules/assessment/service";

const TYPE_BY_QUESTION = {
  SINGLE_CHOICE: "SingleChoiceQuestion",
  TRUE_FALSE_NOT_GIVEN: "TrueFalseNotGivenQuestion",
  GAP_FILL: "GapFillQuestion",
  MULTIPLE_CHOICE: "MultipleChoiceQuestion",
  YES_NO_NOT_GIVEN: "YesNoNotGivenQuestion",
  MATCHING: "MatchingQuestion",
  COMPLETION: "CompletionQuestion",
  SHORT_ANSWER: "ShortAnswerQuestion",
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
  MultipleChoiceQuestion: {
    stem: (q) => multipleChoice.prompt.parse(q.promptJson).stem,
    choose: (q) => multipleChoice.prompt.parse(q.promptJson).choose,
    options: (q, _, ctx) => ctx.loaders.optionsByQuestion.load(q.id),
  },
  YesNoNotGivenQuestion: {
    statement: (q) => yesNoNotGiven.prompt.parse(q.promptJson).statement,
  },
  MatchingQuestion: {
    variant: (q) => matching.prompt.parse(q.promptJson).variant,
    items: (q) => matching.prompt.parse(q.promptJson).items,
    reuse: (q) => matching.prompt.parse(q.promptJson).reuse,
    options: (q, _, ctx) => ctx.loaders.optionsByQuestion.load(q.id),
  },
  CompletionQuestion: {
    variant: (q) => completion.prompt.parse(q.promptJson).variant,
    segments: (q) => completion.prompt.parse(q.promptJson).segments,
    wordLimit: (q) => completion.prompt.parse(q.promptJson).wordLimit,
    wordBox: (q) => completion.prompt.parse(q.promptJson).wordBox ?? null,
  },
  ShortAnswerQuestion: {
    question: (q) => shortAnswer.prompt.parse(q.promptJson).question,
    wordLimit: (q) => shortAnswer.prompt.parse(q.promptJson).wordLimit,
  },
  GapFillSegment: {
    __resolveType: (s) => ("gapId" in s ? "GapSegment" : "TextSegment"),
  },
  CorrectAnswer: {
    __resolveType: (a) => a.__typename ?? "GapsAnswer",
  },
};
