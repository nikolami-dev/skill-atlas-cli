"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parseStars, STARS_KEY, toggleStar } from "@/lib/stars";

// Stars live in localStorage (spec §4.7). Same-tab writes dispatch CHANGED; other tabs fire
// "storage". If localStorage is unavailable (it throws), there are no stars and toggling does nothing.
const CHANGED = "skill-atlas:stars-changed";

function read(): string | null {
  try {
    return window.localStorage.getItem(STARS_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function toggle(key: string) {
  try {
    window.localStorage.setItem(STARS_KEY, JSON.stringify(toggleStar(parseStars(read()), key)));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGED));
}

const noSubscribe = () => () => {};

// useStars returns the starred keys and a toggle. The server snapshot is "no stars", so the server
// render is unstarred and starred skills move up after hydration; ready is false until then.
export function useStars() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  const stars = useMemo(() => new Set(parseStars(raw)), [raw]);
  return { stars, toggle, ready };
}
