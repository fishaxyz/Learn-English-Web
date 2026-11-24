"use server";

import {
  ManageSenseDocument,
  PublishSenseDocument,
  type EditorialSenseFieldsFragment,
  type ManageLexicalSenseInput,
} from "@english/graphql";
import { editorMutation, explain } from "../../../lib/api";

export type SenseResult = { ok: true; sense: EditorialSenseFieldsFragment } | { ok: false; message: string };

/** Creates a word or structure, or saves its draft. The API validates everything and checks the editor's role. */
export async function saveSense(input: ManageLexicalSenseInput): Promise<SenseResult> {
  try {
    return { ok: true, sense: (await editorMutation(ManageSenseDocument, { input })).manageLexicalSense };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

export async function publishSense(senseId: string, lockVersion: number): Promise<SenseResult> {
  try {
    return {
      ok: true,
      sense: (await editorMutation(PublishSenseDocument, { senseId, lockVersion })).publishLexicalSense,
    };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}
