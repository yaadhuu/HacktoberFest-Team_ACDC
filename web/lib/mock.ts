import type { Cluster, ImageItem, SearchMatch } from "./types";

export const CLUSTERS: Cluster[] = [
  { id: "food",    label: "Street food",    color: "#f59e0b", centroid: [ 3.0,  1.5,  0.0] },
  { id: "lab",     label: "Lab equipment",  color: "#67e8f9", centroid: [-2.8,  2.0,  1.2] },
  { id: "arch",    label: "Architecture",   color: "#a78bfa", centroid: [ 1.2, -2.5, -1.5] },
  { id: "wild",    label: "Wildlife",       color: "#34d399", centroid: [-2.0, -2.2,  1.8] },
  { id: "ride",    label: "Vehicles",       color: "#fb7185", centroid: [ 2.5,  0.0, -2.5] },
  { id: "nature",  label: "Nature",         color: "#60a5fa", centroid: [-0.5,  2.8, -1.0] },
];

const CAPTIONS: Record<string, string[]> = {
  food:   ["grilled skewers on a street cart", "noodles in a steaming bowl", "tacos with lime wedges", "fresh dumplings on bamboo", "spiced curry over rice"],
  lab:    ["microscope on a bench", "test tubes in a rack", "centrifuge running", "pipettes and a beaker", "circuit board under lamp"],
  arch:   ["glass tower at dusk", "cathedral arches", "brutalist facade", "spiral staircase", "harbor bridge at night"],
  wild:   ["red fox in snow", "eagle in flight", "deer at forest edge", "elephant drinking", "whale breaching"],
  ride:   ["classic motorcycle", "sports car at corner", "cargo bike loaded", "yellow taxi", "bicycle leaning on wall"],
  nature: ["pine forest in fog", "waterfall into pool", "alpine lake reflection", "desert dunes at sunset", "coastal cliff view"],
};

const TAGS: Record<string, string[]> = {
  food:   ["food", "street", "cooking"],
  lab:    ["science", "equipment", "research"],
  arch:   ["architecture", "building", "urban"],
  wild:   ["animal", "wildlife", "outdoors"],
  ride:   ["vehicle", "transport", "motor"],
  nature: ["nature", "landscape", "scenery"],
};

const rand = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

function makeFor(cluster: Cluster, count: number, startId: number): ImageItem[] {
  const r = rand(startId * 7919);
  const items: ImageItem[] = [];
  for (let i = 0; i < count; i++) {
    const seed = startId + i;
    const caption = CAPTIONS[cluster.id][i % CAPTIONS[cluster.id].length];
    const jitter = () => (r() - 0.5) * 1.6;
    items.push({
      id: `img_${seed}`,
      url: `https://picsum.photos/seed/${cluster.id}${seed}/900/1200`,
      thumb: `https://picsum.photos/seed/${cluster.id}${seed}/400/500`,
      caption,
      tags: TAGS[cluster.id],
      ocr: cluster.id === "food" && i === 0 ? "OPEN · 24h" : undefined,
      cluster: cluster.id,
      xyz: [
        cluster.centroid[0] + jitter(),
        cluster.centroid[1] + jitter(),
        cluster.centroid[2] + jitter(),
      ],
      uploader: { name: ["Sarah J", "Ravi K", "Mina O", "Alex P"][i % 4] },
      source: "preloaded",
      createdAt: new Date(Date.now() - seed * 36e5).toISOString(),
    });
  }
  return items;
}

export const IMAGES: ImageItem[] = CLUSTERS.flatMap((c, idx) =>
  makeFor(c, 12, idx * 100 + 1)
);

export const STATS = {
  indexed: IMAGES.length,
  clusters: CLUSTERS.length,
  liveAdded: 7,
};

export function mockSearch(query: string): SearchMatch[] {
  const q = query.toLowerCase();
  const scored = IMAGES.map((img) => {
    const text = (img.caption + " " + img.tags.join(" ") + " " + (img.ocr ?? "")).toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const hits = words.filter((w) => text.includes(w)).length;
    const score = words.length ? hits / words.length : 0;
    return { img, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return scored.map(({ img, score }) => ({
    image: img,
    score: Math.min(0.99, 0.55 + score * 0.4),
    reason: `Matches "${query}" via caption and tags (${img.tags.slice(0, 2).join(", ")}).`,
    bbox: { x: 0.22, y: 0.28, w: 0.5, h: 0.44 },
  }));
}

export const SUGGESTIONS = [
  "Street food",
  "Lab equipment",
  "Something you'd use to cut vegetables",
  "Find similar to my photo",
];

export const PLACEHOLDERS = [
  "Ask your images anything…",
  "something you'd use to cut vegetables",
  "golden hour on a coastline",
  "a diagram with handwritten notes",
  "red bicycle leaning on a wall",
];
