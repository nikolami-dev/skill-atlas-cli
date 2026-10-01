import Link from "next/link";
import { orgRows, type OrgSummary } from "@/lib/orgs";

const skills = (n: number) => `${n} skill${n === 1 ? "" : "s"}`;

// OrgWidget shows one owner scan (spec §4.8): which repositories of the organization have skills,
// and how many. A row opens the repository view when its index file exists (files = listRepos()).
// Server-rendered; the gallery search does not touch it.
export default function OrgWidget({ file, org, files }: { file: string; org: OrgSummary | null; files: string[] }) {
  if (!org) {
    return (
      <section className="org">
        <p className="error">Cannot read orgs/{file}.json</p>
      </section>
    );
  }
  const total = org.repos.reduce((n, r) => n + r.skills, 0);
  const t = Date.parse(org.scanned_at);
  const scanned = Number.isFinite(t) ? ` · scanned ${new Date(t).toISOString().slice(0, 10)}` : "";
  return (
    <section className="org">
      <h2>{org.owner} organization</h2>
      <p className="muted">
        {org.repos.length} of {org.repos_scanned} repositories have skills · {skills(total)}{scanned}
      </p>
      {org.repos.length > 0 && (
        <ul>
          {orgRows(org, files).map((r) => (
            <li key={r.repo}>
              {r.href ? <Link href={r.href}>{r.repo}</Link> : <span>{r.repo}</span>}{" "}
              <span className="muted">{skills(r.skills)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
