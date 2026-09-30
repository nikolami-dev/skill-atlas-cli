import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { atlasDir, fetchSkillContent, githubUrl, listRepos, loadSkills, stripFrontmatter, type Skill } from "@/lib/atlas";
import { matchesSkill } from "@/lib/filter";
import { percent, skillSimilarities } from "@/lib/similar";
import Shell from "./Shell";

export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const repos = await listRepos();
  if (repos.length === 0) {
    return (
      <Shell repos={repos} repo="">
        <main className="empty">
          No skill indexes in <code>{atlasDir()}</code>. Run <code>skill-atlas scan &lt;github-url&gt;</code> first.
        </main>
      </Shell>
    );
  }

  const repo = typeof sp.repo === "string" ? sp.repo : repos[0];
  let skills: Skill[] | null;
  try {
    skills = await loadSkills(repo);
  } catch (e) {
    return (
      <Shell repos={repos} repo={repo}>
        <main className="empty error">Cannot read {repo}.json: {String(e)}</main>
      </Shell>
    );
  }
  if (!skills) notFound();

  const selected = typeof sp.skill === "string" ? skills.find((s) => s.path === sp.skill) : undefined;
  if (sp.skill && !selected) notFound();

  const rawQ = typeof sp.q === "string" ? sp.q : "";
  const q = rawQ.trim();
  const shown = q ? skills.filter((s) => matchesSkill(s, q)) : skills;

  return (
    <Shell repos={repos} repo={repo}>
      <nav className="sidebar">
        <form action="/" className="filter">
          <input type="hidden" name="repo" value={repo} />
          <input type="search" name="q" defaultValue={rawQ} placeholder="Filter skills…" aria-label="Filter skills" />
          {q && (
            <p className="filter-status">
              {shown.length} of {skills.length} skills · <Link href={{ pathname: "/", query: { repo } }}>Clear</Link>
            </p>
          )}
        </form>
        {skills.length === 0 && <p className="empty">No skills found</p>}
        {skills.length > 0 && shown.length === 0 && <p className="empty">No skills match &quot;{q}&quot;</p>}
        {shown.map((s) => (
          <Link
            key={s.path}
            href={{ query: q ? { repo, skill: s.path, q } : { repo, skill: s.path } }}
            className={s === selected ? "active" : undefined}
            title={s.path}
          >
            {s.name}
            {s.categories?.map((c) => <span key={c} className="tag">{c}</span>)}
          </Link>
        ))}
      </nav>
      <main className="content">
        {selected ? (
          <>
            <SkillHeader s={selected} />
            <Suspense key={"similar " + selected.path} fallback={<p className="empty">Loading similar skills…</p>}>
              <SimilarSkills repo={repo} s={selected} skills={skills} />
            </Suspense>
            <Suspense key={selected.path} fallback={<p className="empty">Loading…</p>}>
              <SkillBody s={selected} />
            </Suspense>
          </>
        ) : (
          <p className="empty">Select a skill</p>
        )}
      </main>
    </Shell>
  );
}

function SkillHeader({ s }: { s: Skill }) {
  const copies = s.paths?.filter((p) => p !== s.path) ?? [];
  return (
    <>
      <h1>{s.name}</h1>
      {s.description && <p className="description">{s.description}</p>}
      <dl className="meta">
        <dt>Path</dt>
        <dd><a href={githubUrl(s)}>{s.path}</a></dd>
        {copies.length > 0 && (
          <>
            <dt>Copies</dt>
            <dd>{copies.map((p) => <div key={p}><a href={githubUrl(s, p)}>{p}</a></div>)}</dd>
          </>
        )}
        {s.categories && (
          <>
            <dt>Categories</dt>
            <dd>{s.categories.map((c) => <span key={c} className="tag">{c}</span>)}</dd>
          </>
        )}
        {s.commit_sha && (
          <>
            <dt>Commit</dt>
            <dd>
              <a href={`https://github.com/${s.repo}/commit/${s.commit_sha}`}><code>{s.commit_sha.slice(0, 7)}</code></a>{" "}
              {s.commit_date && new Date(s.commit_date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
            </dd>
          </>
        )}
      </dl>
    </>
  );
}

// SimilarSkills lists the top 5 other skills of the repo by similarity to s; 0% is omitted.
async function SimilarSkills({ repo, s, skills }: { repo: string; s: Skill; skills: Skill[] }) {
  const { pairs } = await skillSimilarities(skills);
  const byPath = new Map(skills.map((x) => [x.path, x]));
  const top = pairs
    .filter((p) => p.a === s.path || p.b === s.path)
    .map((p) => ({ other: byPath.get(p.a === s.path ? p.b : p.a)!, pct: percent(p.score) }))
    .filter((r) => r.pct > 0)
    .sort((x, y) => y.pct - x.pct || x.other.name.localeCompare(y.other.name))
    .slice(0, 5);
  return (
    <section className="similar">
      <h2>Similar skills</h2>
      {top.length === 0 ? (
        <p className="empty">No similar skills</p>
      ) : (
        <ul>
          {top.map((r) => (
            <li key={r.other.path}>
              <Link href={{ pathname: "/", query: { repo, skill: r.other.path } }}>{r.other.name}</Link>{" "}
              <span className="pct">{r.pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function SkillBody({ s }: { s: Skill }) {
  let md: string;
  try {
    md = await fetchSkillContent(s);
  } catch (e) {
    return (
      <p className="empty error">
        Could not load the skill content ({String(e)}). <a href={githubUrl(s)}>View it on GitHub</a>.
      </p>
    );
  }
  const base = githubUrl(s);
  return (
    <article className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        // Relative links (e.g. references/x.md) point next to the skill file on GitHub.
        urlTransform={(u) => {
          try {
            return defaultUrlTransform(new URL(u, base).href);
          } catch {
            return defaultUrlTransform(u);
          }
        }}
      >
        {stripFrontmatter(md)}
      </Markdown>
    </article>
  );
}
