import { permanentRedirect } from "next/navigation";
import { repoPath } from "@/lib/repos";

// The Similar page moved to /repos/{repo}/similar; old /similar?repo=X links redirect there.
export default async function OldSimilarPage({ searchParams }: PageProps<"/similar">) {
  const { repo } = await searchParams;
  permanentRedirect(typeof repo === "string" ? `${repoPath(repo)}/similar` : "/");
}
