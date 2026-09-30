import Link from "next/link";
import RepoSelect from "./RepoSelect";

const pages = [
  { href: "/", label: "Skills" },
  { href: "/similar", label: "Similar" },
] as const;

// Shell is the page frame shared by all pages: header (title, navbar, repo selector) and the page body.
// page is the current page's path; its navbar link is highlighted.
export default function Shell({ repos, repo, page = "/", children }: {
  repos: string[];
  repo: string;
  page?: (typeof pages)[number]["href"];
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <header>
        <Link href="/" className="title">Skill Atlas</Link>
        <nav className="navbar">
          {pages.map((p) => (
            <Link
              key={p.href}
              href={repo ? { pathname: p.href, query: { repo } } : p.href}
              className={p.href === page ? "active" : undefined}
              aria-current={p.href === page ? "page" : undefined}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        {repos.length > 1 ? <RepoSelect repos={repos} current={repo} /> : <span>{repo}</span>}
      </header>
      {children}
    </div>
  );
}
