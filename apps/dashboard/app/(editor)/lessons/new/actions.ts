"use server";

import { CreateResourceDocument, type CefrLevel, type ResourceKind } from "@english/graphql";
import { redirect } from "next/navigation";
import { editorMutation, explain } from "../../../../lib/api";

export type CreateState = { message: string } | null;

const KINDS: ResourceKind[] = ["READING", "ARTICLE"];
const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export async function createLesson(_: CreateState, form: FormData): Promise<CreateState> {
  const kind = String(form.get("kind")) as ResourceKind;
  const level = String(form.get("level") ?? "");
  const input = {
    siteId: String(form.get("siteId") ?? ""),
    kind: KINDS.includes(kind) ? kind : "READING",
    slug: String(form.get("slug") ?? "").trim(),
    title: String(form.get("title") ?? "").trim(),
    cefrLevel: LEVELS.includes(level as CefrLevel) ? (level as CefrLevel) : null,
  };
  let id: string;
  try {
    id = (await editorMutation(CreateResourceDocument, { input })).createResource.id;
  } catch (error) {
    return { message: explain(error) };
  }
  redirect(`/lessons/${id}`);
}
