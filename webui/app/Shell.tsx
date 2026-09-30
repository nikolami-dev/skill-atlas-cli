import Link from "next/link";
import RepoSelect from "./RepoSelect";

// Shell is the page frame shared by all pages: header (title, repo selector) and the page body.
export default function Shell({ repos, repo, children }: { repos: string[]; repo: string; children: React.ReactNode }) {
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
