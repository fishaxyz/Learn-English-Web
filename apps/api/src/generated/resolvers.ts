import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from "graphql";
import type {
  SiteModel,
  TopicModel,
  ExamLabelModel,
  PublishedResourceModel,
  EditorialResourceModel,
  EditorialLocalizationModel,
  RevisionModel,
  ExerciseSetModel,
  QuestionModel,
  QuestionOptionModel,
  LexicalEntryModel,
  LexicalSenseModel,
  EditorialSenseModel,
  SenseRevisionModel,
  VocabularyItemModel,
  ViewerModel,
  MembershipModel,
} from "../models";
import type { GraphQLContext } from "../context";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  /** An ISO 8601 date-time, in UTC. */
  DateTime: { input: Date; output: Date };
  /**
   * Exercises as editors write them: a list of sets, each {title, instructions?, questions: [...]}, where a question is
   * {type, points?, prompt, options? (single choice), grading, explanation?}. Validated in full by the API; see
   * apps/api/src/modules/assessment/schemas.ts for the exact shape of each question type. Editorial only.
   */
  ExercisePayload: { input: unknown; output: unknown };
  /**
   * A rich-text document (Tiptap JSON, schema version 1). Validated by the API on every write; only known node
   * and mark types are accepted, and links must be http(s) or mailto.
   */
  RichText: { input: unknown; output: unknown };
};

export type ArticleResource = Resource & {
  __typename?: "ArticleResource";
  body: Scalars["RichText"]["output"];
  cefrLevel?: Maybe<CefrLevel>;
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars["ID"]["output"];
  kind: ResourceKind;
  locale: Scalars["String"]["output"];
  publishedAt: Scalars["DateTime"]["output"];
  revisionNo: Scalars["Int"]["output"];
  slug: Scalars["String"]["output"];
  summary?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  topics: Array<Topic>;
};

/** CEFR levels. An editorial estimate of a lesson's difficulty, not a guarantee of a learner's level. */
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type ChoiceAnswer = {
  __typename?: "ChoiceAnswer";
  optionId: Scalars["ID"]["output"];
};

export type CorrectAnswer = ChoiceAnswer | GapsAnswer | JudgementAnswer;

export type CreateResourceInput = {
  body?: InputMaybe<Scalars["RichText"]["input"]>;
  cefrLevel?: InputMaybe<CefrLevel>;
  kind: ResourceKind;
  locale?: Scalars["String"]["input"];
  siteId: Scalars["ID"]["input"];
  slug: Scalars["String"]["input"];
  summary?: InputMaybe<Scalars["String"]["input"]>;
  title: Scalars["String"]["input"];
  topicSlugs?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type EditorialLocalization = {
  __typename?: "EditorialLocalization";
  draft?: Maybe<Revision>;
  id: Scalars["ID"]["output"];
  locale: Scalars["String"]["output"];
  published?: Maybe<Revision>;
  slug: Scalars["String"]["output"];
};

export type EditorialResource = {
  __typename?: "EditorialResource";
  archivedAt?: Maybe<Scalars["DateTime"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  kind: ResourceKind;
  localizations: Array<EditorialLocalization>;
  site: Site;
};

export type EditorialSense = {
  __typename?: "EditorialSense";
  draft?: Maybe<SenseRevision>;
  entry: LexicalEntry;
  id: Scalars["ID"]["output"];
  partOfSpeech: Scalars["String"]["output"];
  published?: Maybe<SenseRevision>;
  senseKey: Scalars["String"]["output"];
  site: Site;
};

export type ExamLabel = {
  __typename?: "ExamLabel";
  code: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
};

export type ExerciseSet = {
  __typename?: "ExerciseSet";
  id: Scalars["ID"]["output"];
  instructions?: Maybe<Scalars["String"]["output"]>;
  questions: Array<Question>;
  title: Scalars["String"]["output"];
};

export type GapAnswer = {
  __typename?: "GapAnswer";
  gapId: Scalars["String"]["output"];
  /** The first accepted answer. */
  text: Scalars["String"]["output"];
};

export type GapAnswerInput = {
  gapId: Scalars["String"]["input"];
  text: Scalars["String"]["input"];
};

export type GapFillQuestion = Question & {
  __typename?: "GapFillQuestion";
  id: Scalars["ID"]["output"];
  points: Scalars["Int"]["output"];
  position: Scalars["Int"]["output"];
  segments: Array<GapFillSegment>;
  type: QuestionType;
};

export type GapFillSegment = GapSegment | TextSegment;

export type GapSegment = {
  __typename?: "GapSegment";
  gapId: Scalars["String"]["output"];
};

export type GapsAnswer = {
  __typename?: "GapsAnswer";
  gaps: Array<GapAnswer>;
};

export type GradePracticeInput = {
  /** At most 100. */
  answers: Array<PracticeAnswerInput>;
  exerciseSetId: Scalars["ID"]["input"];
};

/** The API's own view of its health. Public: it reveals no hostnames, versions of dependencies or errors. */
export type Health = {
  __typename?: "Health";
  database: HealthStatus;
  status: HealthStatus;
};

/** Whether a part of the system is working. */
export type HealthStatus = "DOWN" | "OK";

export type Judgement = "FALSE" | "NOT_GIVEN" | "TRUE";

export type JudgementAnswer = {
  __typename?: "JudgementAnswer";
  judgement: Judgement;
};

export type LexicalCollectionResource = Resource & {
  __typename?: "LexicalCollectionResource";
  body: Scalars["RichText"]["output"];
  cefrLevel?: Maybe<CefrLevel>;
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars["ID"]["output"];
  /** The words, pinned to the exact sense revisions chosen when the collection was published. */
  items: Array<LexicalSense>;
  kind: ResourceKind;
  locale: Scalars["String"]["output"];
  publishedAt: Scalars["DateTime"]["output"];
  revisionNo: Scalars["Int"]["output"];
  slug: Scalars["String"]["output"];
  summary?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  topics: Array<Topic>;
};

export type LexicalEntry = {
  __typename?: "LexicalEntry";
  displayForm: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  kind: LexicalEntryKind;
  language: Scalars["String"]["output"];
  /** Published senses only. */
  senses: Array<LexicalSense>;
};

export type LexicalEntryKind =
  | "COLLOCATION"
  | "IDIOM"
  | "PHRASAL_VERB"
  | "PHRASE"
  /** A grammar or sentence pattern, e.g. "If I were you, I'd + verb". Learners add it whole. */
  | "SENTENCE_PATTERN"
  | "WORD";

export type LexicalExample = {
  __typename?: "LexicalExample";
  explanation?: Maybe<Scalars["String"]["output"]>;
  sentence: Scalars["String"]["output"];
};

export type LexicalExampleInput = {
  explanation?: InputMaybe<Scalars["String"]["input"]>;
  sentence: Scalars["String"]["input"];
};

/** One meaning of a headword, as one exact revision. */
export type LexicalSense = {
  __typename?: "LexicalSense";
  cefrLevel?: Maybe<CefrLevel>;
  definition: Scalars["String"]["output"];
  entry: LexicalEntry;
  examples: Array<LexicalExample>;
  id: Scalars["ID"]["output"];
  partOfSpeech: Scalars["String"]["output"];
  pronunciations: Array<Pronunciation>;
  register?: Maybe<Scalars["String"]["output"]>;
  revisionId: Scalars["ID"]["output"];
  senseKey: Scalars["String"]["output"];
  translations: Array<Translation>;
  usageNote?: Maybe<Scalars["String"]["output"]>;
};

export type ListeningResource = Resource & {
  __typename?: "ListeningResource";
  /** The transcript. Audio tracks and timings arrive in Phase 3. */
  body: Scalars["RichText"]["output"];
  cefrLevel?: Maybe<CefrLevel>;
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars["ID"]["output"];
  kind: ResourceKind;
  locale: Scalars["String"]["output"];
  publishedAt: Scalars["DateTime"]["output"];
  revisionNo: Scalars["Int"]["output"];
  slug: Scalars["String"]["output"];
  summary?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  topics: Array<Topic>;
};

/**
 * Creates a sense (and its entry, given headword and kind), or edits a sense's draft. Editing a sense with no
 * draft starts a new draft revision; the published one is never changed.
 */
export type ManageLexicalSenseInput = {
  cefrLevel?: InputMaybe<CefrLevel>;
  definition: Scalars["String"]["input"];
  /** For a new sense: its entry, or headword + kind to create one. */
  entryId?: InputMaybe<Scalars["ID"]["input"]>;
  examples?: Array<LexicalExampleInput>;
  headword?: InputMaybe<Scalars["String"]["input"]>;
  kind?: InputMaybe<LexicalEntryKind>;
  /** Required when editing an existing draft. */
  lockVersion?: InputMaybe<Scalars["Int"]["input"]>;
  partOfSpeech: Scalars["String"]["input"];
  pronunciations?: Array<PronunciationInput>;
  register?: InputMaybe<Scalars["String"]["input"]>;
  /** An existing sense to edit. Omit to create one. */
  senseId?: InputMaybe<Scalars["ID"]["input"]>;
  senseKey: Scalars["String"]["input"];
  siteId: Scalars["ID"]["input"];
  translations?: Array<TranslationInput>;
  usageNote?: InputMaybe<Scalars["String"]["input"]>;
};

export type Membership = {
  __typename?: "Membership";
  role: SiteRole;
  site: Site;
};

export type Mutation = {
  __typename?: "Mutation";
  /** Admins: take the resource off the site. Its revisions are kept. */
  archiveResource: EditorialResource;
  /** Editors: a new resource with its first draft. */
  createResource: EditorialResource;
  /** Grades answers on the server. Nothing is stored: practice is anonymous in the MVP. */
  gradePractice: PracticeResult;
  manageLexicalSense: EditorialSense;
  publishLexicalSense: EditorialSense;
  /** Admins and owners: publish a draft straight away, without the review queue. Recorded in the audit log. */
  publishNow: EditorialResource;
  /** Reviewers: publish the reviewed draft. The previous published revision is superseded, never changed. */
  publishResource: EditorialResource;
  /** Reviewers: send it back to the editor. */
  returnToDraft: EditorialResource;
  /** Editors: replace the draft's exercises. Validated as a whole. */
  saveExerciseSets: EditorialResource;
  /** Editors: a new draft copied from the published revision (exercises included). */
  startDraft: EditorialResource;
  /** Editors: hand the draft to a reviewer. */
  submitForReview: EditorialResource;
  updateDraft: EditorialResource;
};

export type MutationArchiveResourceArgs = {
  resourceId: Scalars["ID"]["input"];
};

export type MutationCreateResourceArgs = {
  input: CreateResourceInput;
};

export type MutationGradePracticeArgs = {
  input: GradePracticeInput;
};

export type MutationManageLexicalSenseArgs = {
  input: ManageLexicalSenseInput;
};

export type MutationPublishLexicalSenseArgs = {
  lockVersion: Scalars["Int"]["input"];
  senseId: Scalars["ID"]["input"];
};

export type MutationPublishNowArgs = {
  localizationId: Scalars["ID"]["input"];
  lockVersion: Scalars["Int"]["input"];
};

export type MutationPublishResourceArgs = {
  localizationId: Scalars["ID"]["input"];
  lockVersion: Scalars["Int"]["input"];
};

export type MutationReturnToDraftArgs = {
  localizationId: Scalars["ID"]["input"];
  lockVersion: Scalars["Int"]["input"];
  note?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationSaveExerciseSetsArgs = {
  localizationId: Scalars["ID"]["input"];
  lockVersion: Scalars["Int"]["input"];
  sets: Scalars["ExercisePayload"]["input"];
};

export type MutationStartDraftArgs = {
  localizationId: Scalars["ID"]["input"];
};

export type MutationSubmitForReviewArgs = {
  localizationId: Scalars["ID"]["input"];
  lockVersion: Scalars["Int"]["input"];
};

export type MutationUpdateDraftArgs = {
  input: UpdateDraftInput;
};

/** For cursor pagination: pass endCursor as `after` to get the next page. */
export type PageInfo = {
  __typename?: "PageInfo";
  endCursor?: Maybe<Scalars["String"]["output"]>;
  hasNextPage: Scalars["Boolean"]["output"];
};

/** One answer: optionId for single choice, judgement for true/false/not given, gaps for gap fill. */
export type PracticeAnswerInput = {
  gaps?: InputMaybe<Array<GapAnswerInput>>;
  judgement?: InputMaybe<Judgement>;
  optionId?: InputMaybe<Scalars["ID"]["input"]>;
  questionId: Scalars["ID"]["input"];
};

export type PracticeResult = {
  __typename?: "PracticeResult";
  exerciseSetId: Scalars["ID"]["output"];
  maxScore: Scalars["Int"]["output"];
  questions: Array<QuestionResult>;
  score: Scalars["Int"]["output"];
};

export type Pronunciation = {
  __typename?: "Pronunciation";
  /** BCP 47 accent label, e.g. en-GB or en-US. */
  accent: Scalars["String"]["output"];
  ipa: Scalars["String"]["output"];
};

export type PronunciationInput = {
  accent: Scalars["String"]["input"];
  ipa: Scalars["String"]["input"];
};

export type Query = {
  __typename?: "Query";
  /** Editorial: a resource with its draft and published revisions. Members of its site only. */
  editorialResource?: Maybe<EditorialResource>;
  /** Editorial: a site's resources, newest first (at most 100). */
  editorialResources: Array<EditorialResource>;
  /** Editorial: one sense with its draft and published revisions. */
  editorialSense?: Maybe<EditorialSense>;
  /** Editorial: the site's word bank, drafts included, optionally filtered by headword (at most 200). */
  editorialSenses: Array<EditorialSense>;
  /** A published exercise set on this site. */
  exerciseSet?: Maybe<ExerciseSet>;
  health: Health;
  lexicalEntryById?: Maybe<LexicalEntry>;
  /** Exact and fuzzy headword lookup. Only entries with a published sense. `first` is at most 50. */
  lexicalSearch: Array<LexicalEntry>;
  /** Published resources on this site, newest first. `first` is at most 50. */
  publishedResources: ResourceConnection;
  resourceBySlug?: Maybe<Resource>;
  topics: Array<Topic>;
  /** Who is signed in (from the request's session token), or null. */
  viewer?: Maybe<Viewer>;
};

export type QueryEditorialResourceArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryEditorialResourcesArgs = {
  first?: Scalars["Int"]["input"];
  siteId: Scalars["ID"]["input"];
};

export type QueryEditorialSenseArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryEditorialSensesArgs = {
  first?: Scalars["Int"]["input"];
  query?: InputMaybe<Scalars["String"]["input"]>;
  siteId: Scalars["ID"]["input"];
};

export type QueryExerciseSetArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryLexicalEntryByIdArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryLexicalSearchArgs = {
  first?: Scalars["Int"]["input"];
  query: Scalars["String"]["input"];
};

export type QueryPublishedResourcesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  filter?: InputMaybe<ResourceFilter>;
  first?: Scalars["Int"]["input"];
};

export type QueryResourceBySlugArgs = {
  kind: ResourceKind;
  locale?: InputMaybe<Scalars["String"]["input"]>;
  slug: Scalars["String"]["input"];
};

/** A question as the learner sees it. Answers are never part of it: they come back from gradePractice. */
export type Question = {
  id: Scalars["ID"]["output"];
  points: Scalars["Int"]["output"];
  position: Scalars["Int"]["output"];
  type: QuestionType;
};

export type QuestionOption = {
  __typename?: "QuestionOption";
  content: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
};

export type QuestionResult = {
  __typename?: "QuestionResult";
  awardedPoints: Scalars["Int"]["output"];
  correct: Scalars["Boolean"]["output"];
  correctAnswer: CorrectAnswer;
  explanation?: Maybe<Scalars["String"]["output"]>;
  maxPoints: Scalars["Int"]["output"];
  questionId: Scalars["ID"]["output"];
};

export type QuestionType = "GAP_FILL" | "SINGLE_CHOICE" | "TRUE_FALSE_NOT_GIVEN";

export type ReadingResource = Resource & {
  __typename?: "ReadingResource";
  body: Scalars["RichText"]["output"];
  cefrLevel?: Maybe<CefrLevel>;
  /** At about 200 words a minute. */
  estimatedReadingSeconds: Scalars["Int"]["output"];
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars["ID"]["output"];
  kind: ResourceKind;
  locale: Scalars["String"]["output"];
  publishedAt: Scalars["DateTime"]["output"];
  revisionNo: Scalars["Int"]["output"];
  slug: Scalars["String"]["output"];
  summary?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  topics: Array<Topic>;
  /** The word senses the text links to (its `lexical` marks), at the exact revisions it pinned. */
  vocabulary: Array<LexicalSense>;
  /** The same links as learners choose them: one item per word or structure, with key flags and sentences. */
  vocabularyItems: Array<VocabularyItem>;
  wordCount: Scalars["Int"]["output"];
};

/** A published lesson or article, as learners see it. Always one exact, frozen revision. */
export type Resource = {
  body: Scalars["RichText"]["output"];
  cefrLevel?: Maybe<CefrLevel>;
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars["ID"]["output"];
  kind: ResourceKind;
  locale: Scalars["String"]["output"];
  publishedAt: Scalars["DateTime"]["output"];
  revisionNo: Scalars["Int"]["output"];
  slug: Scalars["String"]["output"];
  summary?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  topics: Array<Topic>;
};

export type ResourceConnection = {
  __typename?: "ResourceConnection";
  nodes: Array<Resource>;
  pageInfo: PageInfo;
};

export type ResourceFilter = {
  cefrLevel?: InputMaybe<CefrLevel>;
  kind?: InputMaybe<ResourceKind>;
  /** Defaults to the site's default locale. */
  locale?: InputMaybe<Scalars["String"]["input"]>;
  /** Full-text search in titles, summaries and text. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  topicSlug?: InputMaybe<Scalars["String"]["input"]>;
};

export type ResourceKind = "ARTICLE" | "LEXICAL_COLLECTION" | "LISTENING" | "READING";

export type Revision = {
  __typename?: "Revision";
  body: Scalars["RichText"]["output"];
  cefrLevel?: Maybe<CefrLevel>;
  createdAt: Scalars["DateTime"]["output"];
  /** The exercises, answer keys included, in the shape saveExerciseSets takes. Editors only. */
  exercises: Scalars["ExercisePayload"]["output"];
  id: Scalars["ID"]["output"];
  /** Pass this back when you change the revision; a mismatch means someone else changed it first. */
  lockVersion: Scalars["Int"]["output"];
  publishedAt?: Maybe<Scalars["DateTime"]["output"]>;
  revisionNo: Scalars["Int"]["output"];
  status: RevisionStatus;
  submittedAt?: Maybe<Scalars["DateTime"]["output"]>;
  summary?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  topics: Array<Topic>;
  updatedAt: Scalars["DateTime"]["output"];
  /** The linked word senses, as in the text. */
  vocabulary: Array<LexicalSense>;
  vocabularyItems: Array<VocabularyItem>;
};

export type RevisionStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "SUPERSEDED";

export type SenseRevision = {
  __typename?: "SenseRevision";
  cefrLevel?: Maybe<CefrLevel>;
  definition: Scalars["String"]["output"];
  examples: Array<LexicalExample>;
  id: Scalars["ID"]["output"];
  lockVersion: Scalars["Int"]["output"];
  pronunciations: Array<Pronunciation>;
  publishedAt?: Maybe<Scalars["DateTime"]["output"]>;
  register?: Maybe<Scalars["String"]["output"]>;
  revisionNo: Scalars["Int"]["output"];
  status: RevisionStatus;
  translations: Array<Translation>;
  usageNote?: Maybe<Scalars["String"]["output"]>;
};

export type SingleChoiceQuestion = Question & {
  __typename?: "SingleChoiceQuestion";
  id: Scalars["ID"]["output"];
  options: Array<QuestionOption>;
  points: Scalars["Int"]["output"];
  position: Scalars["Int"]["output"];
  stem: Scalars["String"]["output"];
  type: QuestionType;
};

export type Site = {
  __typename?: "Site";
  defaultLocale: Scalars["String"]["output"];
  domain: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
};

export type SiteRole = "ADMIN" | "EDITOR" | "OWNER" | "REVIEWER" | "VIEWER";

/** Where a vocabulary item appears in a text: a span of one block, and the sentence around it. */
export type TextOccurrence = {
  __typename?: "TextOccurrence";
  blockId: Scalars["String"]["output"];
  end: Scalars["Int"]["output"];
  sentence: Scalars["String"]["output"];
  /** Unicode code-point offsets into the block's text. */
  start: Scalars["Int"]["output"];
  text: Scalars["String"]["output"];
};

export type TextSegment = {
  __typename?: "TextSegment";
  text: Scalars["String"]["output"];
};

export type Topic = {
  __typename?: "Topic";
  description?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  slug: Scalars["String"]["output"];
};

/** The meaning in another language. */
export type Translation = {
  __typename?: "Translation";
  /** BCP 47 language, e.g. vi or pt-BR. */
  locale: Scalars["String"]["output"];
  text: Scalars["String"]["output"];
};

export type TranslationInput = {
  locale: Scalars["String"]["input"];
  text: Scalars["String"]["input"];
};

export type TrueFalseNotGivenQuestion = Question & {
  __typename?: "TrueFalseNotGivenQuestion";
  id: Scalars["ID"]["output"];
  points: Scalars["Int"]["output"];
  position: Scalars["Int"]["output"];
  statement: Scalars["String"]["output"];
  type: QuestionType;
};

export type UpdateDraftInput = {
  body?: InputMaybe<Scalars["RichText"]["input"]>;
  cefrLevel?: InputMaybe<CefrLevel>;
  localizationId: Scalars["ID"]["input"];
  lockVersion: Scalars["Int"]["input"];
  summary?: InputMaybe<Scalars["String"]["input"]>;
  title?: InputMaybe<Scalars["String"]["input"]>;
  /** Replaces the draft's topics. */
  topicSlugs?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

/** The signed-in editor. Learners have no accounts until a later phase. */
export type Viewer = {
  __typename?: "Viewer";
  email: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  memberships: Array<Membership>;
  name?: Maybe<Scalars["String"]["output"]>;
};

/**
 * A word or structure a text links to, as learners choose it: the exact sense revision the text pinned, whether the
 * editor marked it a key word, and every place it appears (a split pattern has several).
 */
export type VocabularyItem = {
  __typename?: "VocabularyItem";
  isKey: Scalars["Boolean"]["output"];
  occurrences: Array<TextOccurrence>;
  sense: LexicalSense;
};

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping of union types */
export type ResolversUnionTypes<_RefType extends Record<string, unknown>> = {
  CorrectAnswer: ChoiceAnswer | GapsAnswer | JudgementAnswer;
  GapFillSegment: GapSegment | TextSegment;
};

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  ArticleResource: ResolverTypeWrapper<PublishedResourceModel>;
  Boolean: ResolverTypeWrapper<Scalars["Boolean"]["output"]>;
  CefrLevel: CefrLevel;
  ChoiceAnswer: ResolverTypeWrapper<ChoiceAnswer>;
  CorrectAnswer: ResolverTypeWrapper<ResolversUnionTypes<ResolversTypes>["CorrectAnswer"]>;
  CreateResourceInput: CreateResourceInput;
  DateTime: ResolverTypeWrapper<Scalars["DateTime"]["output"]>;
  EditorialLocalization: ResolverTypeWrapper<EditorialLocalizationModel>;
  EditorialResource: ResolverTypeWrapper<EditorialResourceModel>;
  EditorialSense: ResolverTypeWrapper<EditorialSenseModel>;
  ExamLabel: ResolverTypeWrapper<ExamLabelModel>;
  ExercisePayload: ResolverTypeWrapper<Scalars["ExercisePayload"]["output"]>;
  ExerciseSet: ResolverTypeWrapper<ExerciseSetModel>;
  GapAnswer: ResolverTypeWrapper<GapAnswer>;
  GapAnswerInput: GapAnswerInput;
  GapFillQuestion: ResolverTypeWrapper<QuestionModel>;
  GapFillSegment: ResolverTypeWrapper<ResolversUnionTypes<ResolversTypes>["GapFillSegment"]>;
  GapSegment: ResolverTypeWrapper<GapSegment>;
  GapsAnswer: ResolverTypeWrapper<GapsAnswer>;
  GradePracticeInput: GradePracticeInput;
  Health: ResolverTypeWrapper<Health>;
  HealthStatus: HealthStatus;
  ID: ResolverTypeWrapper<Scalars["ID"]["output"]>;
  Int: ResolverTypeWrapper<Scalars["Int"]["output"]>;
  Judgement: Judgement;
  JudgementAnswer: ResolverTypeWrapper<JudgementAnswer>;
  LexicalCollectionResource: ResolverTypeWrapper<PublishedResourceModel>;
  LexicalEntry: ResolverTypeWrapper<LexicalEntryModel>;
  LexicalEntryKind: LexicalEntryKind;
  LexicalExample: ResolverTypeWrapper<LexicalExample>;
  LexicalExampleInput: LexicalExampleInput;
  LexicalSense: ResolverTypeWrapper<LexicalSenseModel>;
  ListeningResource: ResolverTypeWrapper<PublishedResourceModel>;
  ManageLexicalSenseInput: ManageLexicalSenseInput;
  Membership: ResolverTypeWrapper<MembershipModel>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  PracticeAnswerInput: PracticeAnswerInput;
  PracticeResult: ResolverTypeWrapper<
    Omit<PracticeResult, "questions"> & { questions: Array<ResolversTypes["QuestionResult"]> }
  >;
  Pronunciation: ResolverTypeWrapper<Pronunciation>;
  PronunciationInput: PronunciationInput;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Question: ResolverTypeWrapper<QuestionModel>;
  QuestionOption: ResolverTypeWrapper<QuestionOptionModel>;
  QuestionResult: ResolverTypeWrapper<
    Omit<QuestionResult, "correctAnswer"> & { correctAnswer: ResolversTypes["CorrectAnswer"] }
  >;
  QuestionType: QuestionType;
  ReadingResource: ResolverTypeWrapper<PublishedResourceModel>;
  Resource: ResolverTypeWrapper<PublishedResourceModel>;
  ResourceConnection: ResolverTypeWrapper<
    Omit<ResourceConnection, "nodes"> & { nodes: Array<ResolversTypes["Resource"]> }
  >;
  ResourceFilter: ResourceFilter;
  ResourceKind: ResourceKind;
  Revision: ResolverTypeWrapper<RevisionModel>;
  RevisionStatus: RevisionStatus;
  RichText: ResolverTypeWrapper<Scalars["RichText"]["output"]>;
  SenseRevision: ResolverTypeWrapper<SenseRevisionModel>;
  SingleChoiceQuestion: ResolverTypeWrapper<QuestionModel>;
  Site: ResolverTypeWrapper<SiteModel>;
  SiteRole: SiteRole;
  String: ResolverTypeWrapper<Scalars["String"]["output"]>;
  TextOccurrence: ResolverTypeWrapper<TextOccurrence>;
  TextSegment: ResolverTypeWrapper<TextSegment>;
  Topic: ResolverTypeWrapper<TopicModel>;
  Translation: ResolverTypeWrapper<Translation>;
  TranslationInput: TranslationInput;
  TrueFalseNotGivenQuestion: ResolverTypeWrapper<QuestionModel>;
  UpdateDraftInput: UpdateDraftInput;
  Viewer: ResolverTypeWrapper<ViewerModel>;
  VocabularyItem: ResolverTypeWrapper<VocabularyItemModel>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  ArticleResource: PublishedResourceModel;
  Boolean: Scalars["Boolean"]["output"];
  ChoiceAnswer: ChoiceAnswer;
  CorrectAnswer: ResolversUnionTypes<ResolversParentTypes>["CorrectAnswer"];
  CreateResourceInput: CreateResourceInput;
  DateTime: Scalars["DateTime"]["output"];
  EditorialLocalization: EditorialLocalizationModel;
  EditorialResource: EditorialResourceModel;
  EditorialSense: EditorialSenseModel;
  ExamLabel: ExamLabelModel;
  ExercisePayload: Scalars["ExercisePayload"]["output"];
  ExerciseSet: ExerciseSetModel;
  GapAnswer: GapAnswer;
  GapAnswerInput: GapAnswerInput;
  GapFillQuestion: QuestionModel;
  GapFillSegment: ResolversUnionTypes<ResolversParentTypes>["GapFillSegment"];
  GapSegment: GapSegment;
  GapsAnswer: GapsAnswer;
  GradePracticeInput: GradePracticeInput;
  Health: Health;
  ID: Scalars["ID"]["output"];
  Int: Scalars["Int"]["output"];
  JudgementAnswer: JudgementAnswer;
  LexicalCollectionResource: PublishedResourceModel;
  LexicalEntry: LexicalEntryModel;
  LexicalExample: LexicalExample;
  LexicalExampleInput: LexicalExampleInput;
  LexicalSense: LexicalSenseModel;
  ListeningResource: PublishedResourceModel;
  ManageLexicalSenseInput: ManageLexicalSenseInput;
  Membership: MembershipModel;
  Mutation: Record<PropertyKey, never>;
  PageInfo: PageInfo;
  PracticeAnswerInput: PracticeAnswerInput;
  PracticeResult: Omit<PracticeResult, "questions"> & { questions: Array<ResolversParentTypes["QuestionResult"]> };
  Pronunciation: Pronunciation;
  PronunciationInput: PronunciationInput;
  Query: Record<PropertyKey, never>;
  Question: QuestionModel;
  QuestionOption: QuestionOptionModel;
  QuestionResult: Omit<QuestionResult, "correctAnswer"> & { correctAnswer: ResolversParentTypes["CorrectAnswer"] };
  ReadingResource: PublishedResourceModel;
  Resource: PublishedResourceModel;
  ResourceConnection: Omit<ResourceConnection, "nodes"> & { nodes: Array<ResolversParentTypes["Resource"]> };
  ResourceFilter: ResourceFilter;
  Revision: RevisionModel;
  RichText: Scalars["RichText"]["output"];
  SenseRevision: SenseRevisionModel;
  SingleChoiceQuestion: QuestionModel;
  Site: SiteModel;
  String: Scalars["String"]["output"];
  TextOccurrence: TextOccurrence;
  TextSegment: TextSegment;
  Topic: TopicModel;
  Translation: Translation;
  TranslationInput: TranslationInput;
  TrueFalseNotGivenQuestion: QuestionModel;
  UpdateDraftInput: UpdateDraftInput;
  Viewer: ViewerModel;
  VocabularyItem: VocabularyItemModel;
};

export type ArticleResourceResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["ArticleResource"] = ResolversParentTypes["ArticleResource"],
> = {
  body?: Resolver<ResolversTypes["RichText"], ParentType, ContextType>;
  cefrLevel?: Resolver<Maybe<ResolversTypes["CefrLevel"]>, ParentType, ContextType>;
  examLabels?: Resolver<Array<ResolversTypes["ExamLabel"]>, ParentType, ContextType>;
  exerciseSets?: Resolver<Array<ResolversTypes["ExerciseSet"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes["ResourceKind"], ParentType, ContextType>;
  locale?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  publishedAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  revisionNo?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  topics?: Resolver<Array<ResolversTypes["Topic"]>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ChoiceAnswerResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["ChoiceAnswer"] = ResolversParentTypes["ChoiceAnswer"],
> = {
  optionId?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CorrectAnswerResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["CorrectAnswer"] = ResolversParentTypes["CorrectAnswer"],
> = {
  __resolveType: TypeResolveFn<"ChoiceAnswer" | "GapsAnswer" | "JudgementAnswer", ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes["DateTime"], any> {
  name: "DateTime";
}

export type EditorialLocalizationResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["EditorialLocalization"] = ResolversParentTypes["EditorialLocalization"],
> = {
  draft?: Resolver<Maybe<ResolversTypes["Revision"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  locale?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  published?: Resolver<Maybe<ResolversTypes["Revision"]>, ParentType, ContextType>;
  slug?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type EditorialResourceResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["EditorialResource"] = ResolversParentTypes["EditorialResource"],
> = {
  archivedAt?: Resolver<Maybe<ResolversTypes["DateTime"]>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes["ResourceKind"], ParentType, ContextType>;
  localizations?: Resolver<Array<ResolversTypes["EditorialLocalization"]>, ParentType, ContextType>;
  site?: Resolver<ResolversTypes["Site"], ParentType, ContextType>;
};

export type EditorialSenseResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["EditorialSense"] = ResolversParentTypes["EditorialSense"],
> = {
  draft?: Resolver<Maybe<ResolversTypes["SenseRevision"]>, ParentType, ContextType>;
  entry?: Resolver<ResolversTypes["LexicalEntry"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  partOfSpeech?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  published?: Resolver<Maybe<ResolversTypes["SenseRevision"]>, ParentType, ContextType>;
  senseKey?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  site?: Resolver<ResolversTypes["Site"], ParentType, ContextType>;
};

export type ExamLabelResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["ExamLabel"] = ResolversParentTypes["ExamLabel"],
> = {
  code?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export interface ExercisePayloadScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes["ExercisePayload"], any> {
  name: "ExercisePayload";
}

export type ExerciseSetResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["ExerciseSet"] = ResolversParentTypes["ExerciseSet"],
> = {
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  instructions?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  questions?: Resolver<Array<ResolversTypes["Question"]>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type GapAnswerResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["GapAnswer"] = ResolversParentTypes["GapAnswer"],
> = {
  gapId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  text?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type GapFillQuestionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["GapFillQuestion"] = ResolversParentTypes["GapFillQuestion"],
> = {
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  points?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  position?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  segments?: Resolver<Array<ResolversTypes["GapFillSegment"]>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes["QuestionType"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type GapFillSegmentResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["GapFillSegment"] = ResolversParentTypes["GapFillSegment"],
> = {
  __resolveType: TypeResolveFn<"GapSegment" | "TextSegment", ParentType, ContextType>;
};

export type GapSegmentResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["GapSegment"] = ResolversParentTypes["GapSegment"],
> = {
  gapId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type GapsAnswerResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["GapsAnswer"] = ResolversParentTypes["GapsAnswer"],
> = {
  gaps?: Resolver<Array<ResolversTypes["GapAnswer"]>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type HealthResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Health"] = ResolversParentTypes["Health"],
> = {
  database?: Resolver<ResolversTypes["HealthStatus"], ParentType, ContextType>;
  status?: Resolver<ResolversTypes["HealthStatus"], ParentType, ContextType>;
};

export type JudgementAnswerResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["JudgementAnswer"] = ResolversParentTypes["JudgementAnswer"],
> = {
  judgement?: Resolver<ResolversTypes["Judgement"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type LexicalCollectionResourceResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["LexicalCollectionResource"] =
    ResolversParentTypes["LexicalCollectionResource"],
> = {
  body?: Resolver<ResolversTypes["RichText"], ParentType, ContextType>;
  cefrLevel?: Resolver<Maybe<ResolversTypes["CefrLevel"]>, ParentType, ContextType>;
  examLabels?: Resolver<Array<ResolversTypes["ExamLabel"]>, ParentType, ContextType>;
  exerciseSets?: Resolver<Array<ResolversTypes["ExerciseSet"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  items?: Resolver<Array<ResolversTypes["LexicalSense"]>, ParentType, ContextType>;
  kind?: Resolver<ResolversTypes["ResourceKind"], ParentType, ContextType>;
  locale?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  publishedAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  revisionNo?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  topics?: Resolver<Array<ResolversTypes["Topic"]>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type LexicalEntryResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["LexicalEntry"] = ResolversParentTypes["LexicalEntry"],
> = {
  displayForm?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes["LexicalEntryKind"], ParentType, ContextType>;
  language?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  senses?: Resolver<Array<ResolversTypes["LexicalSense"]>, ParentType, ContextType>;
};

export type LexicalExampleResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["LexicalExample"] = ResolversParentTypes["LexicalExample"],
> = {
  explanation?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  sentence?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type LexicalSenseResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["LexicalSense"] = ResolversParentTypes["LexicalSense"],
> = {
  cefrLevel?: Resolver<Maybe<ResolversTypes["CefrLevel"]>, ParentType, ContextType>;
  definition?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  entry?: Resolver<ResolversTypes["LexicalEntry"], ParentType, ContextType>;
  examples?: Resolver<Array<ResolversTypes["LexicalExample"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  partOfSpeech?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  pronunciations?: Resolver<Array<ResolversTypes["Pronunciation"]>, ParentType, ContextType>;
  register?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  revisionId?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  senseKey?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes["Translation"]>, ParentType, ContextType>;
  usageNote?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
};

export type ListeningResourceResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["ListeningResource"] = ResolversParentTypes["ListeningResource"],
> = {
  body?: Resolver<ResolversTypes["RichText"], ParentType, ContextType>;
  cefrLevel?: Resolver<Maybe<ResolversTypes["CefrLevel"]>, ParentType, ContextType>;
  examLabels?: Resolver<Array<ResolversTypes["ExamLabel"]>, ParentType, ContextType>;
  exerciseSets?: Resolver<Array<ResolversTypes["ExerciseSet"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes["ResourceKind"], ParentType, ContextType>;
  locale?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  publishedAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  revisionNo?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  topics?: Resolver<Array<ResolversTypes["Topic"]>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MembershipResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Membership"] = ResolversParentTypes["Membership"],
> = {
  role?: Resolver<ResolversTypes["SiteRole"], ParentType, ContextType>;
  site?: Resolver<ResolversTypes["Site"], ParentType, ContextType>;
};

export type MutationResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Mutation"] = ResolversParentTypes["Mutation"],
> = {
  archiveResource?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationArchiveResourceArgs, "resourceId">
  >;
  createResource?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationCreateResourceArgs, "input">
  >;
  gradePractice?: Resolver<
    ResolversTypes["PracticeResult"],
    ParentType,
    ContextType,
    RequireFields<MutationGradePracticeArgs, "input">
  >;
  manageLexicalSense?: Resolver<
    ResolversTypes["EditorialSense"],
    ParentType,
    ContextType,
    RequireFields<MutationManageLexicalSenseArgs, "input">
  >;
  publishLexicalSense?: Resolver<
    ResolversTypes["EditorialSense"],
    ParentType,
    ContextType,
    RequireFields<MutationPublishLexicalSenseArgs, "lockVersion" | "senseId">
  >;
  publishNow?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationPublishNowArgs, "localizationId" | "lockVersion">
  >;
  publishResource?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationPublishResourceArgs, "localizationId" | "lockVersion">
  >;
  returnToDraft?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationReturnToDraftArgs, "localizationId" | "lockVersion">
  >;
  saveExerciseSets?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationSaveExerciseSetsArgs, "localizationId" | "lockVersion" | "sets">
  >;
  startDraft?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationStartDraftArgs, "localizationId">
  >;
  submitForReview?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationSubmitForReviewArgs, "localizationId" | "lockVersion">
  >;
  updateDraft?: Resolver<
    ResolversTypes["EditorialResource"],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateDraftArgs, "input">
  >;
};

export type PageInfoResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["PageInfo"] = ResolversParentTypes["PageInfo"],
> = {
  endCursor?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes["Boolean"], ParentType, ContextType>;
};

export type PracticeResultResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["PracticeResult"] = ResolversParentTypes["PracticeResult"],
> = {
  exerciseSetId?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  maxScore?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  questions?: Resolver<Array<ResolversTypes["QuestionResult"]>, ParentType, ContextType>;
  score?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
};

export type PronunciationResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Pronunciation"] = ResolversParentTypes["Pronunciation"],
> = {
  accent?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  ipa?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type QueryResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Query"] = ResolversParentTypes["Query"],
> = {
  editorialResource?: Resolver<
    Maybe<ResolversTypes["EditorialResource"]>,
    ParentType,
    ContextType,
    RequireFields<QueryEditorialResourceArgs, "id">
  >;
  editorialResources?: Resolver<
    Array<ResolversTypes["EditorialResource"]>,
    ParentType,
    ContextType,
    RequireFields<QueryEditorialResourcesArgs, "first" | "siteId">
  >;
  editorialSense?: Resolver<
    Maybe<ResolversTypes["EditorialSense"]>,
    ParentType,
    ContextType,
    RequireFields<QueryEditorialSenseArgs, "id">
  >;
  editorialSenses?: Resolver<
    Array<ResolversTypes["EditorialSense"]>,
    ParentType,
    ContextType,
    RequireFields<QueryEditorialSensesArgs, "first" | "siteId">
  >;
  exerciseSet?: Resolver<
    Maybe<ResolversTypes["ExerciseSet"]>,
    ParentType,
    ContextType,
    RequireFields<QueryExerciseSetArgs, "id">
  >;
  health?: Resolver<ResolversTypes["Health"], ParentType, ContextType>;
  lexicalEntryById?: Resolver<
    Maybe<ResolversTypes["LexicalEntry"]>,
    ParentType,
    ContextType,
    RequireFields<QueryLexicalEntryByIdArgs, "id">
  >;
  lexicalSearch?: Resolver<
    Array<ResolversTypes["LexicalEntry"]>,
    ParentType,
    ContextType,
    RequireFields<QueryLexicalSearchArgs, "first" | "query">
  >;
  publishedResources?: Resolver<
    ResolversTypes["ResourceConnection"],
    ParentType,
    ContextType,
    RequireFields<QueryPublishedResourcesArgs, "first">
  >;
  resourceBySlug?: Resolver<
    Maybe<ResolversTypes["Resource"]>,
    ParentType,
    ContextType,
    RequireFields<QueryResourceBySlugArgs, "kind" | "slug">
  >;
  topics?: Resolver<Array<ResolversTypes["Topic"]>, ParentType, ContextType>;
  viewer?: Resolver<Maybe<ResolversTypes["Viewer"]>, ParentType, ContextType>;
};

export type QuestionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Question"] = ResolversParentTypes["Question"],
> = {
  __resolveType: TypeResolveFn<
    "GapFillQuestion" | "SingleChoiceQuestion" | "TrueFalseNotGivenQuestion",
    ParentType,
    ContextType
  >;
};

export type QuestionOptionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["QuestionOption"] = ResolversParentTypes["QuestionOption"],
> = {
  content?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
};

export type QuestionResultResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["QuestionResult"] = ResolversParentTypes["QuestionResult"],
> = {
  awardedPoints?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  correct?: Resolver<ResolversTypes["Boolean"], ParentType, ContextType>;
  correctAnswer?: Resolver<ResolversTypes["CorrectAnswer"], ParentType, ContextType>;
  explanation?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  maxPoints?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  questionId?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
};

export type ReadingResourceResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["ReadingResource"] = ResolversParentTypes["ReadingResource"],
> = {
  body?: Resolver<ResolversTypes["RichText"], ParentType, ContextType>;
  cefrLevel?: Resolver<Maybe<ResolversTypes["CefrLevel"]>, ParentType, ContextType>;
  estimatedReadingSeconds?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  examLabels?: Resolver<Array<ResolversTypes["ExamLabel"]>, ParentType, ContextType>;
  exerciseSets?: Resolver<Array<ResolversTypes["ExerciseSet"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes["ResourceKind"], ParentType, ContextType>;
  locale?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  publishedAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  revisionNo?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  topics?: Resolver<Array<ResolversTypes["Topic"]>, ParentType, ContextType>;
  vocabulary?: Resolver<Array<ResolversTypes["LexicalSense"]>, ParentType, ContextType>;
  vocabularyItems?: Resolver<Array<ResolversTypes["VocabularyItem"]>, ParentType, ContextType>;
  wordCount?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ResourceResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Resource"] = ResolversParentTypes["Resource"],
> = {
  __resolveType: TypeResolveFn<
    "ArticleResource" | "LexicalCollectionResource" | "ListeningResource" | "ReadingResource",
    ParentType,
    ContextType
  >;
};

export type ResourceConnectionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["ResourceConnection"] = ResolversParentTypes["ResourceConnection"],
> = {
  nodes?: Resolver<Array<ResolversTypes["Resource"]>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes["PageInfo"], ParentType, ContextType>;
};

export type RevisionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Revision"] = ResolversParentTypes["Revision"],
> = {
  body?: Resolver<ResolversTypes["RichText"], ParentType, ContextType>;
  cefrLevel?: Resolver<Maybe<ResolversTypes["CefrLevel"]>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  exercises?: Resolver<ResolversTypes["ExercisePayload"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  lockVersion?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  publishedAt?: Resolver<Maybe<ResolversTypes["DateTime"]>, ParentType, ContextType>;
  revisionNo?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  status?: Resolver<ResolversTypes["RevisionStatus"], ParentType, ContextType>;
  submittedAt?: Resolver<Maybe<ResolversTypes["DateTime"]>, ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  topics?: Resolver<Array<ResolversTypes["Topic"]>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  vocabulary?: Resolver<Array<ResolversTypes["LexicalSense"]>, ParentType, ContextType>;
  vocabularyItems?: Resolver<Array<ResolversTypes["VocabularyItem"]>, ParentType, ContextType>;
};

export interface RichTextScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes["RichText"], any> {
  name: "RichText";
}

export type SenseRevisionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["SenseRevision"] = ResolversParentTypes["SenseRevision"],
> = {
  cefrLevel?: Resolver<Maybe<ResolversTypes["CefrLevel"]>, ParentType, ContextType>;
  definition?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  examples?: Resolver<Array<ResolversTypes["LexicalExample"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  lockVersion?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  pronunciations?: Resolver<Array<ResolversTypes["Pronunciation"]>, ParentType, ContextType>;
  publishedAt?: Resolver<Maybe<ResolversTypes["DateTime"]>, ParentType, ContextType>;
  register?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  revisionNo?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  status?: Resolver<ResolversTypes["RevisionStatus"], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes["Translation"]>, ParentType, ContextType>;
  usageNote?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
};

export type SingleChoiceQuestionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["SingleChoiceQuestion"] = ResolversParentTypes["SingleChoiceQuestion"],
> = {
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  options?: Resolver<Array<ResolversTypes["QuestionOption"]>, ParentType, ContextType>;
  points?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  position?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  stem?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  type?: Resolver<ResolversTypes["QuestionType"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SiteResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Site"] = ResolversParentTypes["Site"],
> = {
  defaultLocale?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  domain?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type TextOccurrenceResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["TextOccurrence"] = ResolversParentTypes["TextOccurrence"],
> = {
  blockId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  end?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  sentence?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  start?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  text?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type TextSegmentResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["TextSegment"] = ResolversParentTypes["TextSegment"],
> = {
  text?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TopicResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Topic"] = ResolversParentTypes["Topic"],
> = {
  description?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type TranslationResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Translation"] = ResolversParentTypes["Translation"],
> = {
  locale?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  text?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type TrueFalseNotGivenQuestionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["TrueFalseNotGivenQuestion"] =
    ResolversParentTypes["TrueFalseNotGivenQuestion"],
> = {
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  points?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  position?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  statement?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  type?: Resolver<ResolversTypes["QuestionType"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ViewerResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["Viewer"] = ResolversParentTypes["Viewer"],
> = {
  email?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  memberships?: Resolver<Array<ResolversTypes["Membership"]>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
};

export type VocabularyItemResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes["VocabularyItem"] = ResolversParentTypes["VocabularyItem"],
> = {
  isKey?: Resolver<ResolversTypes["Boolean"], ParentType, ContextType>;
  occurrences?: Resolver<Array<ResolversTypes["TextOccurrence"]>, ParentType, ContextType>;
  sense?: Resolver<ResolversTypes["LexicalSense"], ParentType, ContextType>;
};

export type Resolvers<ContextType = GraphQLContext> = {
  ArticleResource?: ArticleResourceResolvers<ContextType>;
  ChoiceAnswer?: ChoiceAnswerResolvers<ContextType>;
  CorrectAnswer?: CorrectAnswerResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  EditorialLocalization?: EditorialLocalizationResolvers<ContextType>;
  EditorialResource?: EditorialResourceResolvers<ContextType>;
  EditorialSense?: EditorialSenseResolvers<ContextType>;
  ExamLabel?: ExamLabelResolvers<ContextType>;
  ExercisePayload?: GraphQLScalarType;
  ExerciseSet?: ExerciseSetResolvers<ContextType>;
  GapAnswer?: GapAnswerResolvers<ContextType>;
  GapFillQuestion?: GapFillQuestionResolvers<ContextType>;
  GapFillSegment?: GapFillSegmentResolvers<ContextType>;
  GapSegment?: GapSegmentResolvers<ContextType>;
  GapsAnswer?: GapsAnswerResolvers<ContextType>;
  Health?: HealthResolvers<ContextType>;
  JudgementAnswer?: JudgementAnswerResolvers<ContextType>;
  LexicalCollectionResource?: LexicalCollectionResourceResolvers<ContextType>;
  LexicalEntry?: LexicalEntryResolvers<ContextType>;
  LexicalExample?: LexicalExampleResolvers<ContextType>;
  LexicalSense?: LexicalSenseResolvers<ContextType>;
  ListeningResource?: ListeningResourceResolvers<ContextType>;
  Membership?: MembershipResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  PracticeResult?: PracticeResultResolvers<ContextType>;
  Pronunciation?: PronunciationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Question?: QuestionResolvers<ContextType>;
  QuestionOption?: QuestionOptionResolvers<ContextType>;
  QuestionResult?: QuestionResultResolvers<ContextType>;
  ReadingResource?: ReadingResourceResolvers<ContextType>;
  Resource?: ResourceResolvers<ContextType>;
  ResourceConnection?: ResourceConnectionResolvers<ContextType>;
  Revision?: RevisionResolvers<ContextType>;
  RichText?: GraphQLScalarType;
  SenseRevision?: SenseRevisionResolvers<ContextType>;
  SingleChoiceQuestion?: SingleChoiceQuestionResolvers<ContextType>;
  Site?: SiteResolvers<ContextType>;
  TextOccurrence?: TextOccurrenceResolvers<ContextType>;
  TextSegment?: TextSegmentResolvers<ContextType>;
  Topic?: TopicResolvers<ContextType>;
  Translation?: TranslationResolvers<ContextType>;
  TrueFalseNotGivenQuestion?: TrueFalseNotGivenQuestionResolvers<ContextType>;
  Viewer?: ViewerResolvers<ContextType>;
  VocabularyItem?: VocabularyItemResolvers<ContextType>;
};
