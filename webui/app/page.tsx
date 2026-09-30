import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { atlasDir, githubUrl, listRepos, loadSkills, rawUrl, stripFrontmatter, type Skill } from "@/lib/atlas";
import RepoSelect from "./RepoSelect";

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

  return (
    <Shell repos={repos} repo={repo}>
      <nav className="sidebar">
        {skills.length === 0 && <p className="empty">No skills found</p>}
        {skills.map((s) => (
          <Link
            key={s.path}
            href={{ query: { repo, skill: s.path } }}
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

function Shell({ repos, repo, children }: { repos: string[]; repo: string; children: React.ReactNode }) {
  return (
    <div className="app">
      <header>
        <Link href="/" className="title">Skill Atlas</Link>
        {repos.length > 1 ? <RepoSelect repos={repos} current={repo} /> : <span>{repo}</span>}
      </header>
      {children}
    </div>
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

async function SkillBody({ s }: { s: Skill }) {
  let md: string;
  try {
    // Pinned to commit_sha, so the content never changes and can be cached forever.
    const res = await fetch(rawUrl(s), { cache: s.commit_sha ? "force-cache" : "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    md = await res.text();
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
