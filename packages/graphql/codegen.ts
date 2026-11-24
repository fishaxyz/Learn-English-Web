import type { CodegenConfig } from "@graphql-codegen/cli";

// Schema-first (AGENTS.md §6): the .graphql files are the contract; every TypeScript type is generated from them.
// Over the wire DateTime is an ISO string; inside the API it is a Date.
const clientScalars = { ID: "string", DateTime: "string", RichText: "unknown", ExercisePayload: "unknown" };
const serverScalars = { ID: "string", DateTime: "Date", RichText: "unknown", ExercisePayload: "unknown" };

const config: CodegenConfig = {
  schema: "schema/**/*.graphql",
  overwrite: true,
  generates: {
    // Shared types for any client (website, dashboard).
    "src/generated/schema-types.ts": {
      plugins: ["typescript"],
      config: { enumsAsTypes: true, scalars: clientScalars, useTypeImports: true },
    },
    // Resolver signatures for the API, typed against its own request context.
    "../../apps/api/src/generated/resolvers.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        enumsAsTypes: true,
        scalars: serverScalars,
        useTypeImports: true,
        contextType: "../context#GraphQLContext",
        useIndexSignature: false,
        // Resolvers return these internal models; field resolvers shape them into the public types.
        mappers: {
          Site: "../models#SiteModel",
          Topic: "../models#TopicModel",
          ExamLabel: "../models#ExamLabelModel",
          Resource: "../models#PublishedResourceModel",
          ReadingResource: "../models#PublishedResourceModel",
          ListeningResource: "../models#PublishedResourceModel",
          LexicalCollectionResource: "../models#PublishedResourceModel",
          ArticleResource: "../models#PublishedResourceModel",
          EditorialResource: "../models#EditorialResourceModel",
          EditorialLocalization: "../models#EditorialLocalizationModel",
          Revision: "../models#RevisionModel",
          ExerciseSet: "../models#ExerciseSetModel",
          Question: "../models#QuestionModel",
          SingleChoiceQuestion: "../models#QuestionModel",
          TrueFalseNotGivenQuestion: "../models#QuestionModel",
          GapFillQuestion: "../models#QuestionModel",
          QuestionOption: "../models#QuestionOptionModel",
          LexicalEntry: "../models#LexicalEntryModel",
          LexicalSense: "../models#LexicalSenseModel",
          EditorialSense: "../models#EditorialSenseModel",
          SenseRevision: "../models#SenseRevisionModel",
          Viewer: "../models#ViewerModel",
          Membership: "../models#MembershipModel",
        },
      },
    },
  },
};

export default config;
