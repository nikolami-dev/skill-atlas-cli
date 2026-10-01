"use client";

import Link from "next/link";
import { repoPath } from "@/lib/repos";
import { starKey, starredSkills } from "@/lib/stars";
import type { GalleryRepo } from "./RepoGallery";
import { useStars } from "./useStars";

// StarredSkills is the home-page widget listing the starred skills of all repositories (spec §4.7).
// Not rendered when nothing is starred; independent of the gallery search.
export default function StarredSkills({ repos }: { repos: GalleryRepo[] }) {
  const { stars } = useStars();
  const list = starredSkills(repos, stars);
  if (list.length === 0) return null;
  return (
    <section className="starred">
      <h2>Starred skills</h2>
      <ul>
        {list.map((s) => (
          <li key={starKey(s.file, s.path)}>
            <Link href={{ pathname: repoPath(s.file), query: { skill: s.path } }}>{s.name}</Link>{" "}
            <span className="muted">{s.repoName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
