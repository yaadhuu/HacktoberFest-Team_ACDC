export default function Logo({ size = 22 }: { size?: number }) {
  const r = size * 0.17;
  const c = size / 2;
  const d = size * 0.33;
  const dots: [number, number, string][] = [
    [c, c - d, "#e5484d"],
    [c + d, c - d * 0.3, "#f59e0b"],
    [c + d * 0.6, c + d * 0.75, "#30a46c"],
    [c - d * 0.6, c + d * 0.75, "#3b82f6"],
    [c - d, c - d * 0.3, "#8b5cf6"],
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {dots.map(([x, y, fill], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={fill} />
      ))}
    </svg>
  );
}
