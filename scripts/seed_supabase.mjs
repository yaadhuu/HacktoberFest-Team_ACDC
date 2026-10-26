// Seed the Supabase 'images' table with the mock preloaded set.
// Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from web/.env.local
// Usage:  node scripts/seed_supabase.mjs
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.resolve(process.cwd(), "web/.env.local");
if (!fs.existsSync(envPath)) {
  console.error("web/.env.local not found. Copy from web/.env.local.example first.");
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const [k, ...r] = l.split("="); return [k.trim(), r.join("=").trim()]; })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("SUPABASE env missing"); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });

// Rebuild the same mock set the web app uses.
const CLUSTERS = [
  { id: "food",   centroid: [ 3.0,  1.5,  0.0] },
  { id: "lab",    centroid: [-2.8,  2.0,  1.2] },
  { id: "arch",   centroid: [ 1.2, -2.5, -1.5] },
  { id: "wild",   centroid: [-2.0, -2.2,  1.8] },
  { id: "ride",   centroid: [ 2.5,  0.0, -2.5] },
  { id: "nature", centroid: [-0.5,  2.8, -1.0] },
];
const CAPTIONS = {
  food:   ["grilled skewers on a street cart", "noodles in a steaming bowl", "tacos with lime wedges", "fresh dumplings on bamboo", "spiced curry over rice"],
  lab:    ["microscope on a bench", "test tubes in a rack", "centrifuge running", "pipettes and a beaker", "circuit board under lamp"],
  arch:   ["glass tower at dusk", "cathedral arches", "brutalist facade", "spiral staircase", "harbor bridge at night"],
  wild:   ["red fox in snow", "eagle in flight", "deer at forest edge", "elephant drinking", "whale breaching"],
  ride:   ["classic motorcycle", "sports car at corner", "cargo bike loaded", "yellow taxi", "bicycle leaning on wall"],
  nature: ["pine forest in fog", "waterfall into pool", "alpine lake reflection", "desert dunes at sunset", "coastal cliff view"],
};
const TAGS = {
  food:["food","street","cooking"], lab:["science","equipment","research"],
  arch:["architecture","building","urban"], wild:["animal","wildlife","outdoors"],
  ride:["vehicle","transport","motor"], nature:["nature","landscape","scenery"],
};
const UPLOADERS = ["Sarah J", "Ravi K", "Mina O", "Alex P"];

const rows = [];
let n = 1;
for (let ci = 0; ci < CLUSTERS.length; ci++) {
  const c = CLUSTERS[ci];
  for (let i = 0; i < 12; i++) {
    const seed = ci * 100 + 1 + i;
    const j = () => (Math.random() - 0.5) * 1.6;
    rows.push({
      id: `img_${seed}`,
      url:   `https://picsum.photos/seed/${c.id}${seed}/900/1200`,
      thumb: `https://picsum.photos/seed/${c.id}${seed}/400/500`,
      caption: CAPTIONS[c.id][i % CAPTIONS[c.id].length],
      tags: TAGS[c.id],
      ocr: c.id === "food" && i === 0 ? "OPEN · 24h" : null,
      x: c.centroid[0] + j(),
      y: c.centroid[1] + j(),
      z: c.centroid[2] + j(),
      cluster_id: c.id,
      uploader_name: UPLOADERS[i % UPLOADERS.length],
      source: "preloaded",
    });
    n++;
  }
}

console.log(`Upserting ${rows.length} images…`);
const { error } = await sb.from("images").upsert(rows, { onConflict: "id" });
if (error) { console.error(error); process.exit(1); }
console.log("Done.");
