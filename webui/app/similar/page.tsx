import Link from "next/link";
import { notFound } from "next/navigation";
import { atlasDir, listRepos, loadSkills, type Skill } from "@/lib/atlas";
import { percent, skillSimilarities } from "@/lib/similar";
import Shell from "../Shell";

const threshold = 30;

export default async function SimilarPage({ searchParams }: PageProps<"/similar">) {
  const sp = await searchParams;
  const repos = await listRepos();
  if (repos.length === 0) {
    return (
      <Shell repos={repos} repo="" page="/similar">
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
      <Shell repos={repos} repo={repo} page="/similar">
        <main className="empty error">Cannot read {repo}.json: {String(e)}</main>
      </Shell>
    );
  }
  if (!skills) notFound();

  const { pairs, compared, failed } = await skillSimilarities(skills);
  const byPath = new Map(skills.map((s) => [s.path, s]));
  const rows = pairs
    .map((p) => ({ a: byPath.get(p.a)!, b: byPath.get(p.b)!, pct: percent(p.score) }))
    .filter((r) => r.pct >= threshold)
    .sort((x, y) => y.pct - x.pct || x.a.name.localeCompare(y.a.name) || x.b.name.localeCompare(y.b.name));
  const link = (s: Skill) => <Link href={{ pathname: "/", query: { repo, skill: s.path } }}>{s.name}</Link>;

  return (
    <Shell repos={repos} repo={repo} page="/similar">
      <main className="content wide">
        <h1>Similar skills</h1>
        <p className="description">
          Pairs of skills in {repo} whose SKILL.md files are at least {threshold}% similar (TF-IDF cosine similarity).
        </p>
        {failed.length > 0 && (
          <p className="error">Could not load the content of (left out): {failed.map((s) => s.name).join(", ")}</p>
        )}
        {compared.length < 2 ? (
          <p className="empty">Need at least 2 skills to compare</p>
        ) : rows.length === 0 ? (
          <p className="empty">No similar skills (≥ {threshold}%)</p>
        ) : (
          <table className="pairs">
            <thead>
              <tr><th>Skill A</th><th>Skill B</th><th>Similarity</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.a.path + "\n" + r.b.path}>
                  <td>{link(r.a)}</td>
                  <td>{link(r.b)}</td>
                  <td className="pct">{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </Shell>
  );
}
