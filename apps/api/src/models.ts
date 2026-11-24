// What resolvers pass around internally (mapped onto the public GraphQL types by codegen's `mappers`).
import type { schema } from "@english/database";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export type SiteModel = Row<typeof schema.sites>;
export type TopicModel = Row<typeof schema.topics>;
export type ExamLabelModel = Row<typeof schema.examLabels>;
export type RevisionModel = Row<typeof schema.resourceRevisions>;
export type ResourceRow = Row<typeof schema.resources>;
export type LocalizationRow = Row<typeof schema.resourceLocalizations>;

/** A resource as published: its row, the localization, and the exact published revision. */
export type PublishedResourceModel = { resource: ResourceRow; localization: LocalizationRow; revision: RevisionModel };
export type EditorialResourceModel = ResourceRow;
export type EditorialLocalizationModel = LocalizationRow;

export type ExerciseSetModel = Row<typeof schema.exerciseSets>;
export type QuestionModel = Row<typeof schema.questions>;
export type QuestionOptionModel = Row<typeof schema.questionOptions>;

export type LexicalEntryModel = Row<typeof schema.lexicalEntries>;
export type SenseRevisionModel = Row<typeof schema.lexicalSenseRevisions>;
/** A sense as learners see it: the sense and one exact revision of it. */
export type LexicalSenseModel = { sense: Row<typeof schema.lexicalSenses>; revision: SenseRevisionModel };
export type EditorialSenseModel = Row<typeof schema.lexicalSenses>;

export type ViewerModel = Row<typeof schema.users>;
export type SiteRoleValue = (typeof schema.siteRole.enumValues)[number];
export type MembershipModel = { siteId: string; role: SiteRoleValue };
