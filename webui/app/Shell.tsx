import Link from "next/link";
import { repoPath } from "@/lib/repos";

// Shell is the page frame shared by all pages. The title always links to the gallery. Inside a
// repository (repo = index file name) it adds a breadcrumb with the display name and the
// Skills | Similar navbar, highlighting the current page.
export default function Shell({ repo, name, page = "skills", children }: {
  repo?: string;
  name?: string;
  page?: "skills" | "similar";
  children: React.ReactNode;
}) {
  const links = repo
    ? [
        { key: "skills", href: repoPath(repo), label: "Skills" },
        { key: "similar", href: `${repoPath(repo)}/similar`, label: "Similar" },
      ]
    : [];
  return (
    <div className="app">
      <header>
        <Link href="/" className="title">Skill Atlas</Link>
        {repo && (
          <>
            <span className="crumb" aria-label="Repository">› {name || repo}</span>
            <nav className="navbar">
              {links.map((l) => (
                <Link
                  key={l.key}
                  href={l.href}
                  className={l.key === page ? "active" : undefined}
                  aria-current={l.key === page ? "page" : undefined}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </>
        )}
      </header>
      {children}
    </div>
  );
}
