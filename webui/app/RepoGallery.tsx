"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { SkillText } from "@/lib/filter";
import { cardHref, matchRepo, type RepoSummary } from "@/lib/repos";

export type GalleryRepo = { summary: RepoSummary; skills: SkillText[]; error?: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const categoryOrder = ["agent", "product", "test"] as const;

// RepoGallery filters the repository cards on every keystroke, with no fetches, and mirrors the
// search in the URL with replaceState (shareable, no history entry per keystroke). The initial
// value comes from the current URL, both on the server (so the first paint is already filtered)
// and when Back restores the page from the router cache after replaceState changed the URL.
export default function RepoGallery({ repos }: { repos: GalleryRepo[] }) {
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const needle = q.trim();

  function update(value: string) {
    setQ(value);
    window.history.replaceState(null, "", value.trim() ? `/?q=${encodeURIComponent(value.trim())}` : "/");
  }

  const shown = repos
    .map((r) => ({ ...r, m: matchRepo(r.summary, r.skills, q) }))
    .filter((r) => r.m.match);

  return (
    <>
      <div className="gallery-search">
        <input
          type="search"
          value={q}
          onChange={(e) => update(e.target.value)}
          placeholder="Search repositories and skills…"
          aria-label="Search repositories and skills"
        />
        {needle && (
          <button type="button" onClick={() => update("")}>
            Clear
          </button>
        )}
      </div>
      {needle && <p className="filter-status">{shown.length} of {repos.length} repositories</p>}
      {shown.length === 0 ? (
        <p className="empty">No repositories match &quot;{needle}&quot;</p>
      ) : (
        <ul className="cards">
          {shown.map(({ summary: s, error, m }) => (
            <li key={s.file}>
              <Link href={cardHref(s.file, m, q)} className={error ? "card error" : "card"}>
                <h2>{s.name}</h2>
                {error ? (
                  <p>Cannot read {s.file}.json</p>
                ) : (
                  <>
                    <p>{plural(s.skillCount, "skill")}</p>
                    {s.categories && (
                      <p className="muted">
                        {categoryOrder
                          .filter((c) => s.categories?.[c])
                          .map((c) => `${s.categories?.[c]} ${c}`)
                          .join(" · ")}
                      </p>
                    )}
                    {s.lastUpdated && <p className="muted">Updated {s.lastUpdated}</p>}
                  </>
                )}
                {m.matchingSkills > 0 && <p className="matching">{plural(m.matchingSkills, "matching skill")}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
