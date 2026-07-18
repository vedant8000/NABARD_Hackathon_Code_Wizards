/** Colorful page hero band: gradient background, rural farm-scene SVG art,
 * floating crop/animal motifs, icon medallion + title. One per screen,
 * each with its own hue — makes pages vivid and instantly recognizable. */
import type { ReactNode } from "react";

/** Rolling fields, sun, hut and crop rows — white silhouette overlay. */
function FarmArt() {
  return (
    <svg viewBox="0 0 640 130" preserveAspectRatio="none" aria-hidden
      className="absolute inset-x-0 bottom-0 w-full h-24 md:h-28 opacity-[0.14] pointer-events-none">
      <circle cx="552" cy="34" r="20" fill="#fff" />
      <circle cx="552" cy="34" r="30" fill="#fff" opacity="0.35" />
      {/* back hill */}
      <path d="M0 96 Q120 52 260 88 T640 84 V130 H0 Z" fill="#fff" opacity="0.55" />
      {/* front hill */}
      <path d="M0 112 Q180 76 340 104 T640 102 V130 H0 Z" fill="#fff" />
      {/* hut */}
      <path d="M76 96 l20 -18 20 18 v26 h-40 Z" fill="#fff" />
      <rect x="90" y="106" width="9" height="16" fill="#14532d" opacity="0.35" />
      {/* crop stems */}
      {[170, 190, 210, 230, 250].map((x, i) => (
        <g key={x} transform={`translate(${x} ${104 + (i % 2) * 4})`}>
          <line x1="0" y1="0" x2="0" y2="18" stroke="#fff" strokeWidth="2.5" />
          <path d="M0 4 q-7 -6 -11 -1 q6 5 11 1 Z" fill="#fff" />
          <path d="M0 9 q7 -6 11 -1 q-6 5 -11 1 Z" fill="#fff" />
        </g>
      ))}
      {/* cow silhouette */}
      <g transform="translate(430 96)" fill="#fff">
        <ellipse cx="16" cy="10" rx="16" ry="9" />
        <rect x="3" y="14" width="4" height="12" rx="1.5" />
        <rect x="24" y="14" width="4" height="12" rx="1.5" />
        <circle cx="33" cy="4" r="5" />
        <path d="M35 -2 q4 -4 6 0" stroke="#fff" strokeWidth="2" fill="none" />
      </g>
    </svg>
  );
}

export default function PageHero({ icon, title, sub, from, to, emojis = [], right }: {
  icon: string; title: string; sub: string; from: string; to: string;
  emojis?: string[]; right?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl text-white p-5 md:px-7 md:py-6 shadow-lift fade-in"
      style={{ background: `linear-gradient(120deg, ${from}, ${to})` }}>
      <FarmArt />
      {emojis.map((e, i) => (
        <span key={i} aria-hidden
          className={`absolute text-2xl md:text-3xl drop-shadow ${["float-a", "float-b", "float-c"][i % 3]}`}
          style={{ right: `${6 + i * 9}%`, top: `${14 + (i % 2) * 34}%`, opacity: 0.9 }}>
          {e}
        </span>
      ))}
      <div className="relative flex items-center gap-4 flex-wrap">
        <span className="medallion bg-white/20 backdrop-blur text-2xl" aria-hidden>{icon}</span>
        <div className="flex-1 min-w-48">
          <h1 className="font-display text-2xl md:text-[1.7rem] font-bold leading-tight">{title}</h1>
          <p className="text-[13px] md:text-sm opacity-85 mt-0.5 max-w-xl">{sub}</p>
        </div>
        {right}
      </div>
    </section>
  );
}
