import { permanentRedirect } from "next/navigation";
import { atlasDir, listRepos, loadSkills } from "@/lib/atlas";
import { repoPath, summarizeRepo } from "@/lib/repos";
import RepoGallery, { type GalleryRepo } from "./RepoGallery";
import Shell from "./Shell";

// The home page: every indexed repository as a card, with an instant search (spec §4.6).
export default async function GalleryPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;

  // Old skill-browser URLs (/?repo=X&skill=…&q=…) moved to /repos/X.
  if (typeof sp.repo === "string") {
    const rest = new URLSearchParams();
    for (const key of ["skill", "q"] as const) {
      const v = sp[key];
      if (typeof v === "string") rest.set(key, v);
    }
    permanentRedirect(repoPath(sp.repo) + (rest.size ? `?${rest}` : ""));
  }

  const files = await listRepos();
  if (files.length === 0) {
    return (
      <Shell>
        <main className="empty">
          No skill indexes in <code>{atlasDir()}</code>. Run <code>skill-atlas scan &lt;github-url&gt;</code> first.
        </main>
      </Shell>
    );
  }

  const repos: GalleryRepo[] = await Promise.all(
    files.map(async (file) => {
      try {
        const skills = (await loadSkills(file)) ?? [];
        // Only what the search needs goes to the client.
        return { summary: summarizeRepo(file, skills), skills: skills.map(({ name, description }) => ({ name, description })) };
      } catch {
        return { summary: summarizeRepo(file, []), skills: [], error: true };
      }
    }),
  );

  return (
    <Shell>
      <main className="content wide gallery">
        <RepoGallery repos={repos} />
      </main>
    </Shell>
  );
}
