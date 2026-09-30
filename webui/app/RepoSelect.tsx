"use client";

import { useRouter } from "next/navigation";

export default function RepoSelect({ repos, current }: { repos: string[]; current: string }) {
  const router = useRouter();
  return (
    <select aria-label="Repository" value={current} onChange={(e) => router.push(`/?repo=${encodeURIComponent(e.target.value)}`)}>
      {repos.map((r) => (
        <option key={r}>{r}</option>
      ))}
    </select>
  );
}
