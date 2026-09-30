import type { Skill } from "./atlas.ts";

// SkillText is the part of a skill that matching looks at; the gallery sends only this to the client.
export type SkillText = Pick<Skill, "name" | "description">;

// matchesSkill reports whether the trimmed q occurs (case-insensitively) in the skill's name or
// description. Paths, categories and SKILL.md content are not searched. A blank q matches everything.
export function matchesSkill(s: SkillText, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [s.name, s.description].some((f) => f?.toLowerCase().includes(needle));
}
