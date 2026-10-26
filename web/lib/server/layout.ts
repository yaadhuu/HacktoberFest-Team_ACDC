import { UMAP } from "umap-js";
import type { Owner } from "./core";

type Pt = number[];
const dist2 = (a: Pt, b: Pt) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);

function kmeans(P: Pt[], k: number): number[] {
  const rnd = (() => { let s = 42; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  let C = [P[Math.floor(rnd() * P.length)]];
  while (C.length < k) { // k-means++ seeding
    const d = P.map((p) => Math.min(...C.map((c) => dist2(p, c))));
    let r = rnd() * d.reduce((a, b) => a + b, 0), i = 0;
    while (r > d[i] && i < P.length - 1) r -= d[i++];
    C.push(P[i]);
  }
  let lab = new Array(P.length).fill(0);
  for (let it = 0; it < 30; it++) {
    lab = P.map((p) => C.reduce((b, c, i) => (dist2(p, c) < dist2(p, C[b]) ? i : b), 0));
    C = C.map((c, i) => {
      const m = P.filter((_, j) => lab[j] === i);
      return m.length ? c.map((_, d) => m.reduce((s, p) => s + p[d], 0) / m.length) : c;
    });
  }
  return lab;
}

/** Each group = compact sphere (keeps its UMAP shape) on a golden-angle spiral, biggest centre, guaranteed gaps. */
function arrange(P: Pt[], lab: number[]) {
  const ks = [...new Set(lab)].sort((a, b) => lab.filter((l) => l === b).length - lab.filter((l) => l === a).length);
  const size = (k: number) => lab.filter((l) => l === k).length;
  const rad = (k: number) => 1 + 0.35 * Math.sqrt(size(k));
  const gap = 2, spacing = 2 * Math.max(...ks.map(rad)) + gap, golden = Math.PI * (3 - Math.sqrt(5));
  const out: Pt[] = P.map(() => [0, 0, 0]);
  const centers = new Map<number, Pt>();
  const placed: [Pt, number][] = [];
  ks.forEach((k, j) => {
    let r = spacing * Math.sqrt(j) * 0.85;
    const a = j * golden;
    let c = [Math.cos(a) * r, ((j % 3) - 1) * 0.8, Math.sin(a) * r];
    for (let guard = 0; guard < 200 && placed.some(([pc, pr]) => Math.hypot(c[0] - pc[0], c[1] - pc[1], c[2] - pc[2]) < pr + rad(k) + gap); guard++) {
      r = Math.max(r, 1) * 1.08; c = [Math.cos(a) * r, c[1], Math.sin(a) * r];
    }
    placed.push([c, rad(k)]); centers.set(k, c);
    const idx = lab.flatMap((l, i) => (l === k ? [i] : []));
    const mean = [0, 1, 2].map((d) => idx.reduce((s, i) => s + P[i][d], 0) / idx.length);
    const loc = idx.map((i) => [0, 1, 2].map((d) => P[i][d] - mean[d]));
    const sc = idx.length > 1 ? Math.max(...loc.flat().map(Math.abs)) || 1 : 1;
    idx.forEach((i, n) => (out[i] = [0, 1, 2].map((d) => c[d] + (loc[n][d] / sc) * rad(k))));
  });
  return { out, centers };
}

export async function layoutGalaxy(o: Owner, gemma: (p: string) => Promise<any>) {
  const { data: rows, error } = await o.sb.from("images").select("id,embedding,caption,primary_category").not("embedding", "is", null);
  if (error) throw new Error(error.message);
  const n = rows?.length ?? 0;
  if (!n) return { clusters: 0, images: 0 };
  const X = rows!.map((r: any) => JSON.parse(r.embedding) as number[]);
  let P: Pt[];
  if (n < 8) P = X.map(() => [Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2]);
  else P = new UMAP({ nComponents: 3, nNeighbors: Math.min(15, n - 1), minDist: 0.2, nEpochs: n > 400 ? 150 : 300 }).fit(X);
  const k = Math.max(1, Math.min(10, Math.round(Math.sqrt(n / 2.5))));
  const lab = n < 8 ? new Array(n).fill(0) : kmeans(P, k);
  const { out, centers } = arrange(P, lab);

  const ks = [...new Set(lab)];
  const names = await Promise.all(ks.map(async (kk) => {
    const idx = lab.flatMap((l, i) => (l === kk ? [i] : []));
    const common = Object.entries(idx.reduce((m: Record<string, number>, i) => ((m[rows![i].primary_category ?? "other"] = (m[rows![i].primary_category ?? "other"] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0][0];
    try {
      const v = await gemma(`Photo captions from one cluster: ${idx.slice(0, 8).map((i) => rows![i].caption).join("; ")}. Reply ONLY JSON {"label": "1-3 word name"}`);
      return String(v.label).slice(0, 32);
    } catch { return common.split("/").pop()!; }
  }));

  const pre = o.id.slice(0, 8);
  const clusters = ks.map((kk, i) => ({ id: `${pre}_c${kk}`, user_id: o.id, label: names[i], size: lab.filter((l) => l === kk).length, cx: centers.get(kk)![0], cy: centers.get(kk)![1], cz: centers.get(kk)![2] }));
  await o.sb.from("user_clusters").delete().eq("user_id", o.id);
  const { error: ce } = await o.sb.from("user_clusters").insert(clusters);
  if (ce) throw new Error(ce.message);
  const payload = rows!.map((r: any, i: number) => ({ id: r.id, x: out[i][0], y: out[i][1], z: out[i][2], cluster_id: `${pre}_c${lab[i]}` }));
  const { error: ue } = await o.sb.rpc("update_layout", { payload });
  if (ue) throw new Error(ue.message);
  return { clusters: clusters.length, images: n };
}
