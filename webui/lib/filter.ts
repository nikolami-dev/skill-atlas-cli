import type { Skill } from "./atlas.ts";

// matchesSkill reports whether the trimmed q occurs (case-insensitively) in the skill's name,
// description, any of its paths, any category, or its raw SKILL.md content. A blank q matches everything.
export function matchesSkill(s: Skill, content: string, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const fields = [s.name, s.description, ...(s.paths ?? [s.path]), ...(s.categories ?? []), content];
  return fields.some((f) => f?.toLowerCase().includes(needle));
}
