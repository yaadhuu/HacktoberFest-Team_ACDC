"use client";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars as Starfield } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { cdn, type Cluster, type Img } from "@/lib/supabase";

export const ACCENT = "#f5b14c";

export type GalaxyProps = {
  imgs: Img[];
  clusters: Cluster[];
  /** id -> relevance 0..1 while a search is active */
  scores: Map<string, number> | null;
  matches: Set<string> | null;
  mode: "highlight" | "reorder";
  filter: Set<string> | null; // allowed top-level categories
  selectedId: string | null;
  arriving: Set<string>;
  introKey: number; // bump to replay
  onIntroEnd: () => void;
  onSelect: (img: Img) => void;
};

export default function Galaxy(p: GalaxyProps) {
  // intro layout: stars start in a centre-focused spiral, then unwind into the real layout
  const [spiral, setSpiral] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // intro plays on every open
    setSpiral(true);
    const t = setTimeout(() => setSpiral(false), 6500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.introKey]);
  return (
    <Canvas camera={{ position: [0, 8, 70], fov: 50, near: 0.1, far: 400 }} dpr={[1, 1.75]} gl={{ antialias: true }}>
      <color attach="background" args={["#05060a"]} />
      <Nebula />
      <Starfield radius={140} depth={60} count={7000} factor={4} saturation={0} fade speed={0.6} />
      <Dust />
      <Meteors imgs={p.imgs} onSelect={p.onSelect} />
      <Stars {...p} spiral={spiral} />
      <CameraRig {...p} />
    </Canvas>
  );
}

/** Spiral-galaxy layout: three arms winding out from a bright core. */
function spiralTargets(n: number, out: Float32Array) {
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1), arm = i % 3;
    const r = 1.5 + Math.sqrt(t) * 15;
    const a = r * 0.55 + (arm * Math.PI * 2) / 3 + Math.sin(i * 12.9898) * 0.12;
    out[i * 3] = Math.cos(a) * r;
    out[i * 3 + 1] = Math.sin(i * 78.233) * 0.35 * (1 - t * 0.6);
    out[i * 3 + 2] = Math.sin(a) * r;
  }
}


// ---------------------------------------------------------------- star field
const vert = /* glsl */ `
attribute float aSize; attribute float aBright; attribute float aHi;
uniform float uTime; uniform float uScale;
varying float vBright; varying float vHi;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float pulse = 1.0 + aHi * 0.22 * sin(uTime * 3.5 + position.x * 2.0);
  gl_PointSize = aSize * pulse * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
  vBright = aBright; vHi = aHi;
}`;
const frag = /* glsl */ `
uniform vec3 uAccent;
varying float vBright; varying float vHi;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  float a = (pow(core, 4.0) + core * 0.28) * vBright;   // tight core + soft halo = subtle bloom
  if (a < 0.004) discard;
  vec3 col = mix(vec3(0.72, 0.74, 0.8), vec3(1.0), vBright);
  col = mix(col, uAccent, vHi);
  gl_FragColor = vec4(col * a, a);
}`;

type Buffers = { pos: Float32Array; tgt: Float32Array; bright: Float32Array; brightT: Float32Array; hi: Float32Array; hiT: Float32Array; size: Float32Array; sizeT: Float32Array };

function topCat(img: Img) {
  return (img.primary_category ?? "").split("/")[0];
}

/** Relevance layout: best matches at the centre/front, the rest drifting outward on shells. */
function reorderTargets(imgs: Img[], scores: Map<string, number>, out: Float32Array) {
  const order = imgs.map((img, i) => ({ i, s: scores.get(img.id) ?? 0 })).sort((a, b) => b.s - a.s);
  const golden = Math.PI * (3 - Math.sqrt(5));
  order.forEach(({ i, s }, rank) => {
    const r = 1.2 + (1 - s) * 13 + rank * 0.004;
    const y = 1 - ((rank * 0.618) % 1) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * rank;
    out[i * 3] = Math.cos(th) * rad * r;
    out[i * 3 + 1] = y * r * 0.6;
    out[i * 3 + 2] = Math.sin(th) * rad * r * 0.7 + (s > 0.5 ? 2 : 0);
  });
}

function Stars(p: GalaxyProps & { spiral: boolean }) {
  const { imgs, clusters, scores, matches, mode, filter, selectedId, arriving, onSelect, spiral } = p;
  const { raycaster, gl } = useThree();
  const n = imgs.length;
  const buf = useRef<Buffers | null>(null);
  const geomIds = useRef<string[]>([]);
  const geom = useMemo(() => new THREE.BufferGeometry(), []);
  const [hover, setHover] = useState<number | null>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uAccent: { value: new THREE.Color(ACCENT) } },
      }),
    [],
  );

  useEffect(() => { raycaster.params.Points = { threshold: 0.18 }; }, [raycaster]);
  useEffect(() => { mat.uniforms.uScale.value = 260 * Math.min(gl.getPixelRatio(), 1.75); }, [gl, mat]);

  // (re)allocate buffers when the image list changes, keeping current positions so arrivals animate in
  useEffect(() => {
    const prev = buf.current;
    const prevIdx = new Map<string, number>();
    geomIds.current.forEach((id, i) => prevIdx.set(id, i));
    const b: Buffers = {
      pos: new Float32Array(n * 3), tgt: new Float32Array(n * 3), bright: new Float32Array(n), brightT: new Float32Array(n),
      hi: new Float32Array(n), hiT: new Float32Array(n), size: new Float32Array(n), sizeT: new Float32Array(n),
    };
    imgs.forEach((img, i) => {
      const j = prevIdx.get(img.id);
      if (prev && j !== undefined) {
        b.pos.set(prev.pos.subarray(j * 3, j * 3 + 3), i * 3);
        b.bright[i] = prev.bright[j]; b.size[i] = prev.size[j]; b.hi[i] = prev.hi[j];
      } else {
        // new star: start far out on a random direction, fly in
        const v = new THREE.Vector3().randomDirection().multiplyScalar(prev ? 45 : 0.01);
        b.pos.set([img.x + v.x, img.y + v.y, img.z + v.z], i * 3);
      }
    });
    buf.current = b;
    geomIds.current = imgs.map((i) => i.id);
    geom.setAttribute("position", new THREE.BufferAttribute(b.pos, 3));
    geom.setAttribute("aBright", new THREE.BufferAttribute(b.bright, 1));
    geom.setAttribute("aHi", new THREE.BufferAttribute(b.hi, 1));
    geom.setAttribute("aSize", new THREE.BufferAttribute(b.size, 1));
    geom.computeBoundingSphere();
  }, [imgs, n, geom]);

  // targets: layout, brightness (cluster density), highlight
  useEffect(() => {
    const b = buf.current;
    if (!b) return;
    const sizeOf = new Map(clusters.map((c) => [c.id, c.size]));
    const maxSize = Math.max(1, ...clusters.map((c) => c.size));
    imgs.forEach((img, i) => {
      b.tgt[i * 3] = img.x; b.tgt[i * 3 + 1] = img.y; b.tgt[i * 3 + 2] = img.z;
      const density = img.cluster_id ? (sizeOf.get(img.cluster_id) ?? 1) / maxSize : 0;
      let br = img.cluster_id ? 0.55 + 0.45 * density : 0.32;
      let sz = img.cluster_id ? 1.0 + 0.6 * density : 0.75;
      let hi = 0;
      if (filter && !filter.has(topCat(img))) br *= 0.12;
      if (scores) {
        const isMatch = matches?.has(img.id) ?? false;
        hi = isMatch ? 1 : 0;
        if (mode === "highlight") { br = isMatch ? 1 : br * 0.12; sz = isMatch ? sz * 1.8 : sz; }
        else { const s = scores.get(img.id) ?? 0; br = 0.15 + 0.85 * s; sz = sz * (0.7 + s); }
      }
      if (img.id === selectedId) { hi = 1; sz *= 2.2; br = 1; }
      if (arriving.has(img.id)) { hi = 1; sz *= 2; br = 1; }
      b.brightT[i] = br; b.sizeT[i] = sz; b.hiT[i] = hi;
    });
    if (scores && mode === "reorder") reorderTargets(imgs, scores, b.tgt);
    else if (spiral) spiralTargets(imgs.length, b.tgt);
  }, [imgs, clusters, scores, matches, mode, filter, selectedId, arriving, spiral]);

  useFrame((_, dt) => {
    const b = buf.current;
    if (!b) return;
    mat.uniforms.uTime.value += dt;
    const k = 1 - Math.pow(0.0025, dt); // frame-rate independent ease
    for (let i = 0; i < b.pos.length; i++) b.pos[i] += (b.tgt[i] - b.pos[i]) * k;
    for (let i = 0; i < b.bright.length; i++) {
      b.bright[i] += (b.brightT[i] - b.bright[i]) * k;
      b.size[i] += (b.sizeT[i] - b.size[i]) * k;
      b.hi[i] += (b.hiT[i] - b.hi[i]) * k;
    }
    for (const name of ["position", "aBright", "aHi", "aSize"]) (geom.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  });

  const hovered = hover !== null ? imgs[hover] : null;
  return (
    <group>
      <points
        geometry={geom}
        material={mat}
        onPointerMove={(e) => { e.stopPropagation(); if (e.index !== undefined) setHover(e.index); }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => { e.stopPropagation(); if (e.index !== undefined && imgs[e.index]) onSelect(imgs[e.index]); }}
      />
      <Thumbs imgs={imgs} buf={buf} />
      {hovered && buf.current && (
        <Html position={[buf.current.pos[hover! * 3], buf.current.pos[hover! * 3 + 1], buf.current.pos[hover! * 3 + 2]]} center
          style={{ pointerEvents: "none" }}>
          <div className="translate-y-[-70px] w-40 rounded-lg overflow-hidden bg-black/80 border border-white/10 text-white text-[11px]">
            <img src={cdn(hovered, 160)} alt="" className="w-full h-24 object-cover" />
            <div className="px-2 py-1 truncate">{hovered.caption}</div>
          </div>
        </Html>
      )}
      {!scores && <ClusterLabels clusters={clusters} />}
    </group>
  );
}

// ---------------------------------------------------------------- LOD: thumbnails near the camera
const MAX_THUMBS = 600;

function Thumbs({ imgs, buf }: { imgs: Img[]; buf: React.MutableRefObject<Buffers | null> }) {
  const [near, setNear] = useState<number[]>([]);
  const tick = useRef(0);
  useFrame(({ camera }) => {
    if (++tick.current % 12 || !buf.current) return;
    const p = buf.current.pos;
    const cands: [number, number][] = [];
    for (let i = 0; i < imgs.length; i++) {
      const dx = p[i * 3] - camera.position.x, dy = p[i * 3 + 1] - camera.position.y, dz = p[i * 3 + 2] - camera.position.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (buf.current.bright[i] > 0.05) cands.push([d, i]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const next = cands.slice(0, MAX_THUMBS).map((c) => c[1]).sort((a, b) => a - b);
    setNear((cur) => (cur.length === next.length && cur.every((v, i) => v === next[i]) ? cur : next));
  });
  return (
    <>
      {near.map((i) => imgs[i] && (
        <Suspense key={imgs[i].id} fallback={null}>
          <Thumb url={cdn(imgs[i], 320)} index={i} buf={buf} />
        </Suspense>
      ))}
    </>
  );
}

/** Shared superellipse (|x|^4 + |y|^4 = 1) alpha mask, antialiased edge. */
let _squircle: THREE.CanvasTexture | null = null;
function squircle() {
  if (_squircle) return _squircle;
  const n = 128, c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d")!, img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1;
    const r = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
    const a = Math.max(0, Math.min(1, (1 - r) * n * 0.5)) * 255;
    const i = (y * n + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = a;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return (_squircle = new THREE.CanvasTexture(c));
}

function Thumb({ url, index, buf }: { url: string; index: number; buf: React.MutableRefObject<Buffers | null> }) {
  const tex = useLoader(THREE.TextureLoader, url);
  const { gl } = useThree();
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace; // without this photos look washed out
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
  }, [tex, gl]);
  const ref = useRef<THREE.Mesh>(null!);
  const fade = useRef(0);
  useFrame(({ camera }, dt) => {
    const b = buf.current;
    if (!b || !ref.current) return;
    ref.current.position.set(b.pos[index * 3], b.pos[index * 3 + 1], b.pos[index * 3 + 2]);
    ref.current.quaternion.copy(camera.quaternion);
    fade.current = Math.min(1, fade.current + dt * 2.5);
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = fade.current * Math.min(1, b.bright[index] * 1.4);
    ref.current.scale.setScalar(0.9 * b.size[index]);
  });
  return (
    <mesh ref={ref}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} alphaMap={squircle()} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** One consistent style; each label floats just above its system (radius mirrors api _arrange). */
function ClusterLabels({ clusters }: { clusters: Cluster[] }) {
  return (
    <>
      {clusters.map((c) => (
        <Html key={c.id} position={[c.cx, c.cy + 1.0 + 0.35 * Math.sqrt(c.size) + 0.7, c.cz]} center distanceFactor={16}
          style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap text-center select-none">
            <div className="uppercase tracking-[0.3em] text-[13px] text-white/75">{c.label}</div>
            <div className="mt-0.5 text-[10px] tracking-widest text-white/35 tabular-nums">{c.size}</div>
          </div>
        </Html>
      ))}
    </>
  );
}

function Dust() {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(1500 * 3);
    for (let i = 0; i < a.length; i++) a[i] = (Math.random() - 0.5) * 160;
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    return g;
  }, []);
  return (
    <points geometry={geom}>
      <pointsMaterial size={0.06} color="#8a8f9c" transparent opacity={0.35} depthWrite={false} />
    </points>
  );
}

// ---------------------------------------------------------------- camera: cinematic intro + fly-to
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
type Shot = { dur: number; at: (t: number, from: { pos: THREE.Vector3; look: THREE.Vector3 }) => { pos: THREE.Vector3; look: THREE.Vector3 } };

function lerpShot(pos: THREE.Vector3, look: THREE.Vector3, dur: number): Shot {
  return { dur, at: (t, f) => ({ pos: f.pos.clone().lerp(pos, ease(t)), look: f.look.clone().lerp(look, ease(t)) }) };
}

function buildIntro(clusters: Cluster[]): Shot[] {
  const origin = new THREE.Vector3();
  const R = 26, H = 6;
  const shots: Shot[] = [
    lerpShot(new THREE.Vector3(0, H, R), origin, 3.2), // slow fly-in
    { dur: 8, at: (t) => { const a = ease(t) * Math.PI * 2; return { pos: new THREE.Vector3(Math.sin(a) * R, H, Math.cos(a) * R), look: origin.clone() }; } },
  ];
  // pass through the densest star systems
  [...clusters].sort((a, b) => b.size - a.size).slice(0, 3).forEach((c) => {
    const ctr = new THREE.Vector3(c.cx, c.cy, c.cz);
    const dir = ctr.clone().add(new THREE.Vector3(0.3, 0.4, 1)).normalize();
    shots.push(lerpShot(ctr.clone().add(dir.multiplyScalar(4.5)), ctr, 2.6));
  });
  shots.push(lerpShot(new THREE.Vector3(0, 5, 24), origin, 2.6));
  return shots;
}

function CameraRig({ clusters, imgs, scores, matches, mode, introKey, onIntroEnd, selectedId }: GalaxyProps) {
  const { camera, gl } = useThree();
  const controls = useRef<any>(null);
  const intro = useRef<{ shots: Shot[]; i: number; t: number; from: { pos: THREE.Vector3; look: THREE.Vector3 } } | null>(null);
  const fly = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);
  const lastInput = useRef(performance.now());
  const IDLE_MS = 8000;
  const ready = imgs.length > 0;

  // start (or replay) the intro
  useEffect(() => {
    if (!ready) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const end = () => { intro.current = null; if (controls.current) controls.current.enabled = true; onIntroEnd(); };
    if (reduced) {
      camera.position.set(0, 5, 24);
      controls.current?.target.set(0, 0, 0);
      end();
      return;
    }
    camera.position.set(0, 8, 70);
    intro.current = { shots: buildIntro(clusters), i: 0, t: 0, from: { pos: camera.position.clone(), look: new THREE.Vector3() } };
    if (controls.current) controls.current.enabled = false;
    const stop = () => { if (intro.current) end(); };
    const el = gl.domElement;
    el.addEventListener("pointerdown", stop);
    el.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("keydown", stop);
    window.addEventListener("bliss:skip-intro", stop);
    return () => {
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("bliss:skip-intro", stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, introKey]);

  // fly to search results / selection
  useEffect(() => {
    if (scores && mode === "reorder") { fly.current = { pos: new THREE.Vector3(0, 2, 16), look: new THREE.Vector3(0, 0, 2) }; return; }
    const ids = selectedId ? new Set([selectedId]) : matches;
    if (!ids || ids.size === 0) { if (!scores && !selectedId) fly.current = null; return; }
    const pts = imgs.filter((i) => ids.has(i.id));
    if (!pts.length) return;
    const c = pts.reduce((a, i) => a.add(new THREE.Vector3(i.x, i.y, i.z)), new THREE.Vector3()).divideScalar(pts.length);
    const spread = Math.max(2.5, ...pts.map((i) => c.distanceTo(new THREE.Vector3(i.x, i.y, i.z))));
    const dir = camera.position.clone().sub(c).normalize();
    fly.current = { pos: c.clone().add(dir.multiplyScalar(selectedId ? 3 : spread * 1.8 + 3)), look: c };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, matches, mode, selectedId]);

  useFrame((_, dt) => {
    const c = controls.current;
    const I = intro.current;
    if (I) {
      const shot = I.shots[I.i];
      I.t = Math.min(1, I.t + dt / shot.dur);
      const { pos, look } = shot.at(I.t, I.from);
      camera.position.copy(pos);
      camera.lookAt(look);
      c?.target.copy(look);
      if (I.t >= 1) {
        I.from = { pos: pos.clone(), look: look.clone() };
        I.i++;
        I.t = 0;
        if (I.i >= I.shots.length) { intro.current = null; if (c) c.enabled = true; onIntroEnd(); }
      }
      return;
    }
    if (fly.current && c) {
      const k = 1 - Math.pow(0.02, dt);
      camera.position.lerp(fly.current.pos, k);
      c.target.lerp(fly.current.look, k);
      if (camera.position.distanceTo(fly.current.pos) < 0.05) fly.current = null;
    }
    // idle drift: after IDLE_MS without input, slowly orbit (ramped in so it never jerks)
    if (c) {
      const idle = !fly.current && !selectedId && performance.now() - lastInput.current > IDLE_MS;
      c.autoRotate = idle || c.autoRotateSpeed > 0.01;
      c.autoRotateSpeed += ((idle ? 0.35 : 0) - c.autoRotateSpeed) * Math.min(1, dt * 0.8);
    }
    c?.update();
  });

  return (
    <OrbitControls ref={controls} enableDamping dampingFactor={0.03} rotateSpeed={0.55} zoomSpeed={0.6} panSpeed={0.6} minDistance={1.5} maxDistance={90}
      onStart={() => { fly.current = null; lastInput.current = performance.now(); if (controls.current) { controls.current.autoRotateSpeed = 0; controls.current.autoRotate = false; } }} />
  );
}

// ---------------------------------------------------------------- deep space: nebula skydome
const nebulaFrag = /* glsl */ `
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float band = exp(-pow(dot(d, normalize(vec3(0.25, 1.0, 0.35))) * 3.2, 2.0));   // tilted Milky Way band
  float n = fbm(d * 3.0 + 7.0);
  float dust = smoothstep(0.45, 0.85, fbm(d * 6.0 + 3.0));                       // dark lanes
  float glow = band * (0.35 + 0.65 * n) * (1.0 - 0.6 * dust);
  float cloud = pow(fbm(d * 2.0 + 13.0), 3.0) * 0.6;                             // faint off-band clouds
  vec3 col = vec3(0.06, 0.07, 0.10) * glow + vec3(0.16, 0.11, 0.07) * glow * n * band + vec3(0.03, 0.035, 0.06) * cloud;
  gl_FragColor = vec4(col, 1.0);
}`;

function Nebula() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: nebulaFrag, side: THREE.BackSide, depthWrite: false,
  }), []);
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ camera }, dt) => { ref.current.position.copy(camera.position); ref.current.rotation.y += dt * 0.004; });
  return <mesh ref={ref} material={mat} renderOrder={-1}><sphereGeometry args={[300, 48, 32]} /></mesh>;
}

// ---------------------------------------------------------------- meteors: click one to surface a random memory
type Meteor = { start: THREE.Vector3; vel: THREE.Vector3; t: number; life: number };

function Meteors({ imgs, onSelect }: { imgs: Img[]; onSelect: (img: Img) => void }) {
  const [m, setM] = useState<Meteor | null>(null);
  const next = useRef(4 + Math.random() * 6);
  const head = useRef<THREE.Group>(null!);
  const trail = useRef<THREE.Mesh>(null!);
  const trailMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uFade: { value: 1 } },
    vertexShader: "varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float uFade; varying float vY; void main(){ float a = pow(vY, 2.2) * uFade; gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * a, a); }",
  }), []);

  useFrame(({ camera }, dt) => {
    if (!m) {
      next.current -= dt;
      if (next.current <= 0 && imgs.length) {
        // spawn in view: ahead of the camera, upper side, streaking diagonally down across the screen
        const fwd = camera.getWorldDirection(new THREE.Vector3());
        const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
        const side = Math.random() < 0.5 ? -1 : 1;
        const start = camera.position.clone().add(fwd.clone().multiplyScalar(28))
          .add(right.clone().multiplyScalar(side * (8 + Math.random() * 8))).add(up.clone().multiplyScalar(8 + Math.random() * 5));
        const vel = right.clone().multiplyScalar(-side * 1).add(up.clone().multiplyScalar(-0.55)).normalize().multiplyScalar(14 + Math.random() * 6);
        setM({ start, vel, t: 0, life: 2.4 });
      }
      return;
    }
    m.t += dt;
    const p = m.start.clone().addScaledVector(m.vel, m.t);
    head.current.position.copy(p);
    // trail: a thin tapered quad pointing back along the velocity
    const len = Math.min(6, 2 + m.t * 6);
    const dir = m.vel.clone().normalize();
    trail.current.position.copy(p).addScaledVector(dir, -len / 2);
    trail.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    trail.current.scale.set(1, len, 1);
    const fade = Math.min(1, m.t * 4) * Math.min(1, (m.life - m.t) * 2);
    trailMat.uniforms.uFade.value = fade;
    (head.current.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = fade;
    if (m.t >= m.life) { setM(null); next.current = 7 + Math.random() * 12; }
  });

  if (!m) return null;
  return (
    <>
      <group ref={head} onClick={(e) => { e.stopPropagation(); onSelect(imgs[Math.floor(Math.random() * imgs.length)]); setM(null); next.current = 6 + Math.random() * 10; }}
        onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "default")}>
        <mesh><sphereGeometry args={[0.12, 12, 12]} /><meshBasicMaterial color="#fff6e8" transparent /></mesh>
        <mesh><sphereGeometry args={[1.6, 8, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      </group>
      <mesh ref={trail} material={trailMat}><cylinderGeometry args={[0.05, 0.003, 1, 8, 1, true]} /></mesh>
    </>
  );
}
