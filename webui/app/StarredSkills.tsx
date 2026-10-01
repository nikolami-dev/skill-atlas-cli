"use client";

import Link from "next/link";
import { repoPath } from "@/lib/repos";
import { starKey, starredSkills } from "@/lib/stars";
import type { GalleryRepo } from "./RepoGallery";
import { useStars } from "./useStars";

// StarredSkills is the home-page widget listing the starred skills of all repositories, each with
// an unstar button (spec §4.7). Independent of the gallery search. Before hydration the stars are
// unknown, so only the heading is rendered, never a false "No starred skills".
export default function StarredSkills({ repos }: { repos: GalleryRepo[] }) {
  const { stars, toggle, ready } = useStars();
  const list = starredSkills(repos, stars);
  return (
    <section className="starred">
      <h2>Starred skills</h2>
      {ready && list.length === 0 && <p className="empty">No starred skills</p>}
      {list.length > 0 && (
        <ul>
          {list.map((s) => (
            <li key={starKey(s.file, s.path)}>
              <Link href={{ pathname: repoPath(s.file), query: { skill: s.path } }}>{s.name}</Link>{" "}
              <span className="muted">{s.repoName}</span>{" "}
              <button type="button" className="unstar" aria-label={`Unstar ${s.name} (${s.repoName})`} onClick={() => toggle(starKey(s.file, s.path))}>
                Unstar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
