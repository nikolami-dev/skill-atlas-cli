"use client";

import Link from "next/link";
import { repoPath } from "@/lib/repos";
import { starKey, starredFirst } from "@/lib/stars";
import { useStars } from "./useStars";

export type ListedSkill = { name: string; path: string; categories?: string[] };

// SkillList renders the sidebar's skill links (already filtered, in name order), starred skills
// first (spec §4.7). Links keep q while filtering, so the filter survives selecting a skill.
export default function SkillList({ file, skills, q, selected }: {
  file: string;
  skills: ListedSkill[];
  q: string;
  selected?: string;
}) {
  const { stars } = useStars();
  return starredFirst(file, skills, stars).map((s) => (
    <Link
      key={s.path}
      href={{ pathname: repoPath(file), query: q ? { skill: s.path, q } : { skill: s.path } }}
      className={s.path === selected ? "active" : undefined}
      title={s.path}
    >
      {stars.has(starKey(file, s.path)) && <span className="star" role="img" aria-label="Starred">★</span>}
      {s.name}
      {s.categories?.map((c) => <span key={c} className="tag">{c}</span>)}
    </Link>
  ));
}
