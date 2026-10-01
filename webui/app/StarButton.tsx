"use client";

import { starKey } from "@/lib/stars";
import { useStars } from "./useStars";

// StarButton stars or unstars one skill (spec §4.7). Disabled until hydrated, so an early click
// isn't lost.
export default function StarButton({ file, path }: { file: string; path: string }) {
  const { stars, toggle, ready } = useStars();
  const key = starKey(file, path);
  const on = stars.has(key);
  return (
    <button
      type="button"
      className={on ? "star-toggle on" : "star-toggle"}
      aria-label="Star this skill"
      aria-pressed={on}
      disabled={!ready}
      onClick={() => toggle(key)}
    >
      {on ? "★ Starred" : "☆ Star"}
    </button>
  );
}
