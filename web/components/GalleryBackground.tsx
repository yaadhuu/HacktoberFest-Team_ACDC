import { IMAGES } from "@/lib/mock";

const COLUMNS = 6;

function pickColumn(colIdx: number, perCol: number) {
  const start = (colIdx * 7) % IMAGES.length;
  const out = [];
  for (let i = 0; i < perCol; i++) out.push(IMAGES[(start + i * 3) % IMAGES.length]);
  return out;
}

export default function GalleryBackground() {
  const perCol = 10;
  const cols = Array.from({ length: COLUMNS }, (_, i) => pickColumn(i, perCol));

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="absolute inset-0 flex gap-5 px-5"
        style={{ transform: "rotate(-6deg) scale(1.25)", transformOrigin: "center" }}
      >
        {cols.map((col, i) => {
          const reverse = i % 2 === 1;
          const dur = 60 + (i % 3) * 15;
          return (
            <div key={i} className="flex-1 min-w-0">
              <div
                className={reverse ? "animate-scrollYRev" : "animate-scrollY"}
                style={{ animationDuration: `${dur}s` }}
              >
                {[...col, ...col].map((img, k) => (
                  <div
                    key={`${img.id}-${k}`}
                    className="mb-5 rounded-2xl overflow-hidden bg-white shadow-[0_10px_30px_-14px_rgba(14,14,16,0.18)]"
                    style={{ aspectRatio: "3/4" }}
                  >
                    <img
                      src={img.thumb}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Center wash to make hero legible */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(241,239,233,0.92),rgba(241,239,233,0.65)_40%,rgba(241,239,233,0.3)_75%,rgba(241,239,233,0.1))]" />
    </div>
  );
}
