"use client";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CLUSTERS, IMAGES, mockSearch } from "@/lib/mock";
import { fetchAllImages, subscribe, toItem } from "@/lib/liveStore";
import type { ImageItem } from "@/lib/types";

type Props = {
  mode: "3d" | "2d";
  query: string;
  activeClusters: Set<string>;
  onSelect: (img: ImageItem) => void;
  onLiveArrive?: (img: ImageItem) => void;
  tourKey: number;
};

export default function GalaxyScene(props: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 55 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
    >
      <color attach="background" args={["#06070c"]} />
      <ambientLight intensity={0.6} />
      <Stars />
      <Suspense fallback={null}>
        <SceneContents {...props} />
      </Suspense>
      <OrbitControls
        enablePan
        enableZoom
        enableRotate={props.mode === "3d"}
        minDistance={3}
        maxDistance={25}
      />
    </Canvas>
  );
}

function Stars() {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <points geometry={geom}>
      <pointsMaterial size={0.04} color="#8ea2ff" transparent opacity={0.6} />
    </points>
  );
}

function SceneContents({ mode, query, activeClusters, onSelect, onLiveArrive, tourKey }: Props) {
  const [all, setAll] = useState<ImageItem[]>(IMAGES);
  const [arrivingId, setArrivingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllImages().then((imgs) => { if (!cancelled) setAll(imgs.map(toItem)); });
    const unsub = subscribe((row) => {
      const img = toItem(row);
      setAll((prev) => prev.some((p) => p.id === img.id) ? prev : [...prev, img]);
      setArrivingId(img.id);
      onLiveArrive?.(img);
      setTimeout(() => setArrivingId((cur) => (cur === img.id ? null : cur)), 2200);
    });
    return () => { cancelled = true; unsub(); };
  }, [onLiveArrive]);

  const matches = useMemo(() => (query ? mockSearch(query) : []), [query]);
  const matchIds = useMemo(() => new Set(matches.map((m) => m.image.id)), [matches]);
  const visibleImgs = all.filter((i) => activeClusters.has(i.cluster));
  const target = matches[0]?.image;

  useCameraFly(target, mode, tourKey);

  return (
    <group>
      {CLUSTERS.filter((c) => activeClusters.has(c.id)).map((c) => (
        <ClusterLabel key={c.id} centroid={c.centroid} label={c.label} color={c.color} mode={mode} dim={!!query} />
      ))}
      {visibleImgs.map((img) => (
        <ImagePoint
          key={img.id}
          img={img}
          mode={mode}
          onSelect={onSelect}
          highlight={query ? matchIds.has(img.id) : null}
          arriving={arrivingId === img.id}
        />
      ))}
    </group>
  );
}

function pos(img: ImageItem, mode: "2d" | "3d"): [number, number, number] {
  return mode === "3d" ? img.xyz : [img.xyz[0], img.xyz[1], 0];
}

function ImagePoint({
  img, mode, onSelect, highlight, arriving,
}: {
  img: ImageItem;
  mode: "2d" | "3d";
  onSelect: (i: ImageItem) => void;
  highlight: boolean | null;
  arriving: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const groupRef = useRef<THREE.Group>(null!);
  const [hover, setHover] = useState(false);
  const tex = useLoader(THREE.TextureLoader, img.thumb);
  const [tx, ty, tz] = pos(img, mode);

  const dim = highlight === false;
  const glow = highlight === true;

  // Live-arrival: fly in from camera-facing direction toward final position
  const arriveStart = useRef<number | null>(null);
  useFrame(({ camera, clock }) => {
    if (!ref.current || !groupRef.current) return;
    ref.current.quaternion.copy(camera.quaternion);
    const pulse = (glow || arriving) ? 1 + Math.sin(clock.elapsedTime * 5) * 0.1 : 1;
    const scale = (hover ? 1.4 : 1) * pulse;
    ref.current.scale.setScalar(scale);

    if (arriving) {
      if (arriveStart.current == null) arriveStart.current = clock.elapsedTime;
      const t = Math.min(1, (clock.elapsedTime - arriveStart.current) / 1.6);
      const ease = 1 - Math.pow(1 - t, 3);
      // start position: pulled toward camera + above
      const startX = tx + (camera.position.x - tx) * (1 - ease) * 0.9;
      const startY = ty + 5 * (1 - ease);
      const startZ = tz + (camera.position.z - tz) * (1 - ease) * 0.9;
      groupRef.current.position.set(startX, startY, startZ);
    } else {
      groupRef.current.position.set(tx, ty, tz);
    }
  });

  const liveColor = img.source === "live";

  return (
    <group ref={groupRef}>
      <mesh
        ref={ref}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "default"; }}
        onClick={(e) => { e.stopPropagation(); onSelect(img); }}
      >
        <planeGeometry args={[0.5, 0.65]} />
        <meshBasicMaterial
          map={tex}
          transparent
          opacity={dim ? 0.18 : 1}
          color={glow ? new THREE.Color("#ffffff") : new THREE.Color("#dddddd")}
        />
      </mesh>
      {(glow || arriving) && (
        <mesh>
          <ringGeometry args={[0.42, 0.52, 32]} />
          <meshBasicMaterial color={arriving ? "#30d158" : "#8ea2ff"} transparent opacity={0.65} />
        </mesh>
      )}
      {liveColor && !arriving && (
        <mesh position={[0.22, 0.3, 0.01]}>
          <circleGeometry args={[0.04, 16]} />
          <meshBasicMaterial color="#30d158" />
        </mesh>
      )}
      {hover && (
        <Html distanceFactor={6} position={[0, -0.55, 0]} center>
          <div className="pointer-events-none text-[11px] leading-tight px-2 py-1 rounded-md bg-black/85 border border-white/10 text-white max-w-[180px] text-center">
            {img.caption}
            <div className="text-white/60 mt-0.5">{img.tags.slice(0, 3).join(" · ")}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function ClusterLabel({
  centroid, label, color, mode, dim,
}: {
  centroid: [number, number, number];
  label: string; color: string; mode: "2d" | "3d"; dim: boolean;
}) {
  const [x, y, z] = mode === "3d" ? centroid : [centroid[0], centroid[1], 0];
  return (
    <group position={[x, y + 1.4, z]}>
      <Html center distanceFactor={10}>
        <div
          className={`px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase whitespace-nowrap transition-opacity ${
            dim ? "opacity-30" : "opacity-100"
          }`}
          style={{
            color,
            background: `${color}22`,
            border: `1px solid ${color}66`,
            boxShadow: `0 0 24px ${color}55`,
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

function useCameraFly(target: ImageItem | undefined, mode: "2d" | "3d", tourKey: number) {
  const { camera } = useThree();
  const dest = useRef<THREE.Vector3 | null>(null);
  const tourIdx = useRef(0);
  const tourTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!target) return;
    const [x, y, z] = pos(target, mode);
    dest.current = new THREE.Vector3(x, y, z + 4);
  }, [target, mode]);

  useEffect(() => {
    if (tourTimer.current) clearInterval(tourTimer.current);
    if (tourKey === 0) return;
    tourIdx.current = 0;
    const step = () => {
      const c = CLUSTERS[tourIdx.current % CLUSTERS.length];
      const [x, y, z] = mode === "3d" ? c.centroid : [c.centroid[0], c.centroid[1], 0];
      dest.current = new THREE.Vector3(x, y, z + 5);
      tourIdx.current++;
    };
    step();
    tourTimer.current = setInterval(step, 3200);
    return () => { if (tourTimer.current) clearInterval(tourTimer.current); };
  }, [tourKey, mode]);

  useFrame(() => {
    if (!dest.current) return;
    camera.position.lerp(dest.current, 0.05);
    camera.lookAt(0, 0, 0);
  });
}
