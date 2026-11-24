import type { SiteRoleValue } from "../models";

/**
 * Who may do what, per site (AGENTS.md §5.6). Editors write; reviewers approve and publish; admins also
 * archive and manage members; owners can do everything. Viewers only read.
 */
const RULES = {
  "content.read": ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"],
  "content.write": ["OWNER", "ADMIN", "EDITOR"],
  "content.submit": ["OWNER", "ADMIN", "EDITOR"],
  "content.review": ["OWNER", "ADMIN", "REVIEWER"],
  "content.publish": ["OWNER", "ADMIN", "REVIEWER"],
  /** Publish a draft straight away, without the review queue: people who may both write and approve. */
  "content.publishNow": ["OWNER", "ADMIN"],
  "content.archive": ["OWNER", "ADMIN"],
  "lexicon.write": ["OWNER", "ADMIN", "EDITOR"],
  "lexicon.publish": ["OWNER", "ADMIN", "REVIEWER"],
} as const satisfies Record<string, readonly SiteRoleValue[]>;

export type Permission = keyof typeof RULES;

export function can(role: SiteRoleValue | undefined, permission: Permission): boolean {
  return role !== undefined && (RULES[permission] as readonly SiteRoleValue[]).includes(role);
}
