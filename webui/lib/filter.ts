import type { Skill } from "./atlas.ts";

// matchesSkill reports whether the trimmed q occurs (case-insensitively) in the skill's name or
// description. Paths, categories and SKILL.md content are not searched. A blank q matches everything.
export function matchesSkill(s: Skill, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [s.name, s.description].some((f) => f?.toLowerCase().includes(needle));
}
