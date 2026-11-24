export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** An ISO 8601 date-time, in UTC. */
  DateTime: { input: string; output: string; }
  /**
   * Exercises as editors write them: a list of sets, each {title, instructions?, questions: [...]}, where a question is
   * {type, points?, prompt, options? (single choice), grading, explanation?}. Validated in full by the API; see
   * apps/api/src/modules/assessment/schemas.ts for the exact shape of each question type. Editorial only.
   */
  ExercisePayload: { input: unknown; output: unknown; }
  /**
   * A rich-text document (Tiptap JSON, schema version 1). Validated by the API on every write; only known node
   * and mark types are accepted, and links must be http(s) or mailto.
   */
  RichText: { input: unknown; output: unknown; }
};

export type ArticleResource = Resource & {
  __typename?: 'ArticleResource';
  body: Scalars['RichText']['output'];
  cefrLevel?: Maybe<CefrLevel>;
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars['ID']['output'];
  kind: ResourceKind;
  locale: Scalars['String']['output'];
  publishedAt: Scalars['DateTime']['output'];
  revisionNo: Scalars['Int']['output'];
  slug: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  topics: Array<Topic>;
};

/** CEFR levels. An editorial estimate of a lesson's difficulty, not a guarantee of a learner's level. */
export type CefrLevel =
  | 'A1'
  | 'A2'
  | 'B1'
  | 'B2'
  | 'C1'
  | 'C2';

export type ChoiceAnswer = {
  __typename?: 'ChoiceAnswer';
  optionId: Scalars['ID']['output'];
};

export type CorrectAnswer = ChoiceAnswer | GapsAnswer | JudgementAnswer;

export type CreateResourceInput = {
  body?: InputMaybe<Scalars['RichText']['input']>;
  cefrLevel?: InputMaybe<CefrLevel>;
  kind: ResourceKind;
  locale?: Scalars['String']['input'];
  siteId: Scalars['ID']['input'];
  slug: Scalars['String']['input'];
  summary?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  topicSlugs?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type EditorialLocalization = {
  __typename?: 'EditorialLocalization';
  draft?: Maybe<Revision>;
  id: Scalars['ID']['output'];
  locale: Scalars['String']['output'];
  published?: Maybe<Revision>;
  slug: Scalars['String']['output'];
};

export type EditorialResource = {
  __typename?: 'EditorialResource';
  archivedAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  kind: ResourceKind;
  localizations: Array<EditorialLocalization>;
  site: Site;
};

export type EditorialSense = {
  __typename?: 'EditorialSense';
  draft?: Maybe<SenseRevision>;
  entry: LexicalEntry;
  id: Scalars['ID']['output'];
  partOfSpeech: Scalars['String']['output'];
  published?: Maybe<SenseRevision>;
  senseKey: Scalars['String']['output'];
};

export type ExamLabel = {
  __typename?: 'ExamLabel';
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type ExerciseSet = {
  __typename?: 'ExerciseSet';
  id: Scalars['ID']['output'];
  instructions?: Maybe<Scalars['String']['output']>;
  questions: Array<Question>;
  title: Scalars['String']['output'];
};

export type GapAnswer = {
  __typename?: 'GapAnswer';
  gapId: Scalars['String']['output'];
  /** The first accepted answer. */
  text: Scalars['String']['output'];
};

export type GapAnswerInput = {
  gapId: Scalars['String']['input'];
  text: Scalars['String']['input'];
};

export type GapFillQuestion = Question & {
  __typename?: 'GapFillQuestion';
  id: Scalars['ID']['output'];
  points: Scalars['Int']['output'];
  position: Scalars['Int']['output'];
  segments: Array<GapFillSegment>;
  type: QuestionType;
};

export type GapFillSegment = GapSegment | TextSegment;

export type GapSegment = {
  __typename?: 'GapSegment';
  gapId: Scalars['String']['output'];
};

export type GapsAnswer = {
  __typename?: 'GapsAnswer';
  gaps: Array<GapAnswer>;
};

export type GradePracticeInput = {
  /** At most 100. */
  answers: Array<PracticeAnswerInput>;
  exerciseSetId: Scalars['ID']['input'];
};

/** The API's own view of its health. Public: it reveals no hostnames, versions of dependencies or errors. */
export type Health = {
  __typename?: 'Health';
  database: HealthStatus;
  status: HealthStatus;
};

/** Whether a part of the system is working. */
export type HealthStatus =
  | 'DOWN'
  | 'OK';

export type Judgement =
  | 'FALSE'
  | 'NOT_GIVEN'
  | 'TRUE';

export type JudgementAnswer = {
  __typename?: 'JudgementAnswer';
  judgement: Judgement;
};

export type LexicalCollectionResource = Resource & {
  __typename?: 'LexicalCollectionResource';
  body: Scalars['RichText']['output'];
  cefrLevel?: Maybe<CefrLevel>;
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars['ID']['output'];
  /** The words, pinned to the exact sense revisions chosen when the collection was published. */
  items: Array<LexicalSense>;
  kind: ResourceKind;
  locale: Scalars['String']['output'];
  publishedAt: Scalars['DateTime']['output'];
  revisionNo: Scalars['Int']['output'];
  slug: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  topics: Array<Topic>;
};

export type LexicalEntry = {
  __typename?: 'LexicalEntry';
  displayForm: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  kind: LexicalEntryKind;
  language: Scalars['String']['output'];
  /** Published senses only. */
  senses: Array<LexicalSense>;
};

export type LexicalEntryKind =
  | 'COLLOCATION'
  | 'IDIOM'
  | 'PHRASAL_VERB'
  | 'PHRASE'
  | 'WORD';

export type LexicalExample = {
  __typename?: 'LexicalExample';
  explanation?: Maybe<Scalars['String']['output']>;
  sentence: Scalars['String']['output'];
};

export type LexicalExampleInput = {
  explanation?: InputMaybe<Scalars['String']['input']>;
  sentence: Scalars['String']['input'];
};

/** One meaning of a headword, as one exact revision. */
export type LexicalSense = {
  __typename?: 'LexicalSense';
  cefrLevel?: Maybe<CefrLevel>;
  definition: Scalars['String']['output'];
  entry: LexicalEntry;
  examples: Array<LexicalExample>;
  id: Scalars['ID']['output'];
  partOfSpeech: Scalars['String']['output'];
  pronunciations: Array<Pronunciation>;
  register?: Maybe<Scalars['String']['output']>;
  revisionId: Scalars['ID']['output'];
  senseKey: Scalars['String']['output'];
  usageNote?: Maybe<Scalars['String']['output']>;
};

export type ListeningResource = Resource & {
  __typename?: 'ListeningResource';
  /** The transcript. Audio tracks and timings arrive in Phase 3. */
  body: Scalars['RichText']['output'];
  cefrLevel?: Maybe<CefrLevel>;
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars['ID']['output'];
  kind: ResourceKind;
  locale: Scalars['String']['output'];
  publishedAt: Scalars['DateTime']['output'];
  revisionNo: Scalars['Int']['output'];
  slug: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  topics: Array<Topic>;
};

/**
 * Creates a sense (and its entry, given headword and kind), or edits a sense's draft. Editing a sense with no
 * draft starts a new draft revision; the published one is never changed.
 */
export type ManageLexicalSenseInput = {
  cefrLevel?: InputMaybe<CefrLevel>;
  definition: Scalars['String']['input'];
  /** For a new sense: its entry, or headword + kind to create one. */
  entryId?: InputMaybe<Scalars['ID']['input']>;
  examples?: Array<LexicalExampleInput>;
  headword?: InputMaybe<Scalars['String']['input']>;
  kind?: InputMaybe<LexicalEntryKind>;
  /** Required when editing an existing draft. */
  lockVersion?: InputMaybe<Scalars['Int']['input']>;
  partOfSpeech: Scalars['String']['input'];
  pronunciations?: Array<PronunciationInput>;
  register?: InputMaybe<Scalars['String']['input']>;
  /** An existing sense to edit. Omit to create one. */
  senseId?: InputMaybe<Scalars['ID']['input']>;
  senseKey: Scalars['String']['input'];
  siteId: Scalars['ID']['input'];
  usageNote?: InputMaybe<Scalars['String']['input']>;
};

export type Membership = {
  __typename?: 'Membership';
  role: SiteRole;
  site: Site;
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Admins: take the resource off the site. Its revisions are kept. */
  archiveResource: EditorialResource;
  /** Editors: a new resource with its first draft. */
  createResource: EditorialResource;
  /** Grades answers on the server. Nothing is stored: practice is anonymous in the MVP. */
  gradePractice: PracticeResult;
  manageLexicalSense: EditorialSense;
  publishLexicalSense: EditorialSense;
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
  resourceId: Scalars['ID']['input'];
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
  lockVersion: Scalars['Int']['input'];
  senseId: Scalars['ID']['input'];
};


export type MutationPublishResourceArgs = {
  localizationId: Scalars['ID']['input'];
  lockVersion: Scalars['Int']['input'];
};


export type MutationReturnToDraftArgs = {
  localizationId: Scalars['ID']['input'];
  lockVersion: Scalars['Int']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSaveExerciseSetsArgs = {
  localizationId: Scalars['ID']['input'];
  lockVersion: Scalars['Int']['input'];
  sets: Scalars['ExercisePayload']['input'];
};


export type MutationStartDraftArgs = {
  localizationId: Scalars['ID']['input'];
};


export type MutationSubmitForReviewArgs = {
  localizationId: Scalars['ID']['input'];
  lockVersion: Scalars['Int']['input'];
};


export type MutationUpdateDraftArgs = {
  input: UpdateDraftInput;
};

/** For cursor pagination: pass endCursor as `after` to get the next page. */
export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

/** One answer: optionId for single choice, judgement for true/false/not given, gaps for gap fill. */
export type PracticeAnswerInput = {
  gaps?: InputMaybe<Array<GapAnswerInput>>;
  judgement?: InputMaybe<Judgement>;
  optionId?: InputMaybe<Scalars['ID']['input']>;
  questionId: Scalars['ID']['input'];
};

export type PracticeResult = {
  __typename?: 'PracticeResult';
  exerciseSetId: Scalars['ID']['output'];
  maxScore: Scalars['Int']['output'];
  questions: Array<QuestionResult>;
  score: Scalars['Int']['output'];
};

export type Pronunciation = {
  __typename?: 'Pronunciation';
  /** BCP 47 accent label, e.g. en-GB or en-US. */
  accent: Scalars['String']['output'];
  ipa: Scalars['String']['output'];
};

export type PronunciationInput = {
  accent: Scalars['String']['input'];
  ipa: Scalars['String']['input'];
};

export type Query = {
  __typename?: 'Query';
  /** Editorial: a resource with its draft and published revisions. Members of its site only. */
  editorialResource?: Maybe<EditorialResource>;
  /** Editorial: a site's resources, newest first (at most 100). */
  editorialResources: Array<EditorialResource>;
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
  id: Scalars['ID']['input'];
};


export type QueryEditorialResourcesArgs = {
  first?: Scalars['Int']['input'];
  siteId: Scalars['ID']['input'];
};


export type QueryExerciseSetArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLexicalEntryByIdArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLexicalSearchArgs = {
  first?: Scalars['Int']['input'];
  query: Scalars['String']['input'];
};


export type QueryPublishedResourcesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ResourceFilter>;
  first?: Scalars['Int']['input'];
};


export type QueryResourceBySlugArgs = {
  kind: ResourceKind;
  locale?: InputMaybe<Scalars['String']['input']>;
  slug: Scalars['String']['input'];
};

/** A question as the learner sees it. Answers are never part of it: they come back from gradePractice. */
export type Question = {
  id: Scalars['ID']['output'];
  points: Scalars['Int']['output'];
  position: Scalars['Int']['output'];
  type: QuestionType;
};

export type QuestionOption = {
  __typename?: 'QuestionOption';
  content: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type QuestionResult = {
  __typename?: 'QuestionResult';
  awardedPoints: Scalars['Int']['output'];
  correct: Scalars['Boolean']['output'];
  correctAnswer: CorrectAnswer;
  explanation?: Maybe<Scalars['String']['output']>;
  maxPoints: Scalars['Int']['output'];
  questionId: Scalars['ID']['output'];
};

export type QuestionType =
  | 'GAP_FILL'
  | 'SINGLE_CHOICE'
  | 'TRUE_FALSE_NOT_GIVEN';

export type ReadingResource = Resource & {
  __typename?: 'ReadingResource';
  body: Scalars['RichText']['output'];
  cefrLevel?: Maybe<CefrLevel>;
  /** At about 200 words a minute. */
  estimatedReadingSeconds: Scalars['Int']['output'];
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars['ID']['output'];
  kind: ResourceKind;
  locale: Scalars['String']['output'];
  publishedAt: Scalars['DateTime']['output'];
  revisionNo: Scalars['Int']['output'];
  slug: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  topics: Array<Topic>;
  /** The word senses the text links to (its `lexical` marks), at the exact revisions it pinned. */
  vocabulary: Array<LexicalSense>;
  wordCount: Scalars['Int']['output'];
};

/** A published lesson or article, as learners see it. Always one exact, frozen revision. */
export type Resource = {
  body: Scalars['RichText']['output'];
  cefrLevel?: Maybe<CefrLevel>;
  examLabels: Array<ExamLabel>;
  exerciseSets: Array<ExerciseSet>;
  id: Scalars['ID']['output'];
  kind: ResourceKind;
  locale: Scalars['String']['output'];
  publishedAt: Scalars['DateTime']['output'];
  revisionNo: Scalars['Int']['output'];
  slug: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  topics: Array<Topic>;
};

export type ResourceConnection = {
  __typename?: 'ResourceConnection';
  nodes: Array<Resource>;
  pageInfo: PageInfo;
};

export type ResourceFilter = {
  cefrLevel?: InputMaybe<CefrLevel>;
  kind?: InputMaybe<ResourceKind>;
  /** Defaults to the site's default locale. */
  locale?: InputMaybe<Scalars['String']['input']>;
  /** Full-text search in titles, summaries and text. */
  search?: InputMaybe<Scalars['String']['input']>;
  topicSlug?: InputMaybe<Scalars['String']['input']>;
};

export type ResourceKind =
  | 'ARTICLE'
  | 'LEXICAL_COLLECTION'
  | 'LISTENING'
  | 'READING';

export type Revision = {
  __typename?: 'Revision';
  body: Scalars['RichText']['output'];
  cefrLevel?: Maybe<CefrLevel>;
  createdAt: Scalars['DateTime']['output'];
  /** The exercises, answer keys included, in the shape saveExerciseSets takes. Editors only. */
  exercises: Scalars['ExercisePayload']['output'];
  id: Scalars['ID']['output'];
  /** Pass this back when you change the revision; a mismatch means someone else changed it first. */
  lockVersion: Scalars['Int']['output'];
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  revisionNo: Scalars['Int']['output'];
  status: RevisionStatus;
  submittedAt?: Maybe<Scalars['DateTime']['output']>;
  summary?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  topics: Array<Topic>;
  updatedAt: Scalars['DateTime']['output'];
  /** The linked word senses, as in the text. */
  vocabulary: Array<LexicalSense>;
};

export type RevisionStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'PUBLISHED'
  | 'SUPERSEDED';

export type SenseRevision = {
  __typename?: 'SenseRevision';
  cefrLevel?: Maybe<CefrLevel>;
  definition: Scalars['String']['output'];
  examples: Array<LexicalExample>;
  id: Scalars['ID']['output'];
  lockVersion: Scalars['Int']['output'];
  pronunciations: Array<Pronunciation>;
  register?: Maybe<Scalars['String']['output']>;
  revisionNo: Scalars['Int']['output'];
  status: RevisionStatus;
  usageNote?: Maybe<Scalars['String']['output']>;
};

export type SingleChoiceQuestion = Question & {
  __typename?: 'SingleChoiceQuestion';
  id: Scalars['ID']['output'];
  options: Array<QuestionOption>;
  points: Scalars['Int']['output'];
  position: Scalars['Int']['output'];
  stem: Scalars['String']['output'];
  type: QuestionType;
};

export type Site = {
  __typename?: 'Site';
  defaultLocale: Scalars['String']['output'];
  domain: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type SiteRole =
  | 'ADMIN'
  | 'EDITOR'
  | 'OWNER'
  | 'REVIEWER'
  | 'VIEWER';

export type TextSegment = {
  __typename?: 'TextSegment';
  text: Scalars['String']['output'];
};

export type Topic = {
  __typename?: 'Topic';
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type TrueFalseNotGivenQuestion = Question & {
  __typename?: 'TrueFalseNotGivenQuestion';
  id: Scalars['ID']['output'];
  points: Scalars['Int']['output'];
  position: Scalars['Int']['output'];
  statement: Scalars['String']['output'];
  type: QuestionType;
};

export type UpdateDraftInput = {
  body?: InputMaybe<Scalars['RichText']['input']>;
  cefrLevel?: InputMaybe<CefrLevel>;
  localizationId: Scalars['ID']['input'];
  lockVersion: Scalars['Int']['input'];
  summary?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  /** Replaces the draft's topics. */
  topicSlugs?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** The signed-in editor. Learners have no accounts until a later phase. */
export type Viewer = {
  __typename?: 'Viewer';
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  memberships: Array<Membership>;
  name?: Maybe<Scalars['String']['output']>;
};
