import { fetchSkillContent, type Skill } from "./atlas.ts";

export type Pair = { a: string; b: string; score: number };

// tokenize lowercases the text and splits it into letter/digit runs of at least 2 characters.
const tokenize = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);

// similarities returns the TF-IDF cosine similarity (0..1) of every pair of docs, each pair once,
// in input order (a before b). A doc without tokens scores 0 with everything.
export function similarities(docs: { key: string; text: string }[]): Pair[] {
  const tfs = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of tokenize(d.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const tf of tfs) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const vectors = tfs.map((tf) => {
    const v = new Map<string, number>();
    let sq = 0;
    for (const [t, c] of tf) {
      const w = c * (Math.log((1 + n) / (1 + df.get(t)!)) + 1);
      v.set(t, w);
      sq += w * w;
    }
    return { v, norm: Math.sqrt(sq) };
  });

  const pairs: Pair[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const x = vectors[i], y = vectors[j];
      let score = 0;
      if (x.norm > 0 && y.norm > 0) {
        let dot = 0;
        for (const [t, w] of x.v) dot += w * (y.v.get(t) ?? 0);
        score = Math.min(1, dot / (x.norm * y.norm));
      }
      pairs.push({ a: docs[i].key, b: docs[j].key, score });
    }
  }
  return pairs;
}

export const percent = (score: number) => Math.round(score * 100);

// skillSimilarities fetches the content of all skills in parallel and compares them, keyed by path.
// Skills whose content can't be fetched are left out and returned in failed.
export async function skillSimilarities(skills: Skill[]): Promise<{ pairs: Pair[]; compared: Skill[]; failed: Skill[] }> {
  const contents = await Promise.all(skills.map((s) => fetchSkillContent(s).catch(() => null)));
  const compared = skills.filter((_, i) => contents[i] !== null);
  const failed = skills.filter((_, i) => contents[i] === null);
  const docs = compared.map((s) => ({ key: s.path, text: contents[skills.indexOf(s)]! }));
  return { pairs: similarities(docs), compared, failed };
}
