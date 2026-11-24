import "server-only";
import { ViewerDocument, type ViewerQuery } from "@english/graphql";
import { redirect } from "next/navigation";
import { cache } from "react";
import { editorQuery } from "./api";

export type Viewer = NonNullable<ViewerQuery["viewer"]>;
export type Role = Viewer["memberships"][number]["role"];

/** The signed-in editor, once per request. No session, or no longer a member anywhere: back to sign-in. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const { viewer } = await editorQuery(ViewerDocument, {});
  if (!viewer || viewer.memberships.length === 0) redirect("/sign-in");
  return viewer;
});

/** The membership for a site the editor picked, or their first one. Every viewer has at least one. */
export function membershipFor(viewer: Viewer, siteId?: string) {
  const membership = viewer.memberships.find((m) => m.site.id === siteId) ?? viewer.memberships[0];
  if (!membership) redirect("/sign-in");
  return membership;
}

export const roleOn = (viewer: Viewer, siteId: string): Role | undefined =>
  viewer.memberships.find((m) => m.site.id === siteId)?.role;

/** What each role may do, mirroring the API's rules (the API still checks every call). */
export const can = {
  write: (r: Role | undefined) => r === "OWNER" || r === "ADMIN" || r === "EDITOR",
  review: (r: Role | undefined) => r === "OWNER" || r === "ADMIN" || r === "REVIEWER",
  archive: (r: Role | undefined) => r === "OWNER" || r === "ADMIN",
};
