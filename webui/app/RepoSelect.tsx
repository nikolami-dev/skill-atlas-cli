"use client";

import { usePathname, useRouter } from "next/navigation";

// RepoSelect navigates to the chosen repo on the current page (/ or /similar).
export default function RepoSelect({ repos, current }: { repos: string[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select aria-label="Repository" value={current} onChange={(e) => router.push(`${pathname}?repo=${encodeURIComponent(e.target.value)}`)}>
      {repos.map((r) => (
        <option key={r}>{r}</option>
      ))}
    </select>
  );
}
