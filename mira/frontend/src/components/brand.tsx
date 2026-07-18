/** Brand bits shared by sidebar/login: leaf logo, wordmark, village art. */

export function LeafLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M24 44 C24 30 28 18 42 10 C40 26 34 38 24 44 Z" fill="#4ade80" />
      <path d="M24 44 C24 30 20 18 6 10 C8 26 14 38 24 44 Z" fill="#166534" />
      <circle cx="24" cy="8" r="4" fill="#fbbf24" />
    </svg>
  );
}

export function Wordmark({ compact = false, caption }: { compact?: boolean; caption?: string }) {
  const captionText = caption ?? "Mitra for Intelligent Rural Analytics";
  return (
    <div className="flex items-center gap-2.5">
      <LeafLogo size={compact ? 30 : 36} />
      <div className="leading-none">
        <p className={`font-display font-bold text-forest-800 ${compact ? "text-xl" : "text-2xl"}`}>
          MIRA <span className={compact ? "text-sm" : "text-base"}>मीरा</span>
        </p>
        {!compact && captionText && (
          <p className="text-[8.5px] font-extrabold tracking-[0.14em] text-forest-800/45 uppercase mt-1">
            {captionText}
          </p>
        )}
      </div>
    </div>
  );
}

/** Soft watercolor-style village scene for the sidebar bottom. */
export function VillageArt() {
  return (
    <svg viewBox="0 0 220 140" aria-hidden className="w-full h-auto opacity-90">
      {/* sky glow */}
      <ellipse cx="180" cy="30" rx="26" ry="26" fill="#fde68a" opacity="0.55" />
      {/* hills */}
      <path d="M0 96 Q55 62 110 88 T220 84 V140 H0 Z" fill="#bbe3c5" />
      <path d="M0 112 Q70 86 140 106 T220 104 V140 H0 Z" fill="#8fce9f" />
      <path d="M0 126 Q80 108 160 122 T220 120 V140 H0 Z" fill="#5fb377" />
      {/* windmill */}
      <g stroke="#8a6d4b" strokeWidth="3" fill="none">
        <line x1="52" y1="96" x2="52" y2="56" />
        <line x1="52" y1="56" x2="38" y2="44" />
        <line x1="52" y1="56" x2="66" y2="44" />
        <line x1="52" y1="56" x2="52" y2="38" />
      </g>
      <circle cx="52" cy="56" r="3.5" fill="#8a6d4b" />
      {/* water tower */}
      <g fill="#b9987a">
        <rect x="150" y="58" width="22" height="16" rx="4" />
        <line x1="154" y1="74" x2="154" y2="96" stroke="#8a6d4b" strokeWidth="3" />
        <line x1="168" y1="74" x2="168" y2="96" stroke="#8a6d4b" strokeWidth="3" />
      </g>
      {/* huts */}
      <g>
        <rect x="92" y="88" width="26" height="18" rx="2" fill="#e8d3b0" />
        <path d="M88 88 L105 74 L122 88 Z" fill="#c2410c" opacity="0.85" />
        <rect x="101" y="96" width="8" height="10" fill="#8a6d4b" />
      </g>
      <g>
        <rect x="128" y="94" width="20" height="14" rx="2" fill="#e8d3b0" />
        <path d="M125 94 L138 83 L151 94 Z" fill="#d97706" opacity="0.85" />
      </g>
      {/* trees */}
      {[
        [22, 100], [188, 96], [76, 104],
      ].map(([x, y]) => (
        <g key={`${x}`} transform={`translate(${x} ${y})`}>
          <rect x="-2" y="6" width="4" height="12" fill="#8a6d4b" />
          <circle cx="0" cy="0" r="10" fill="#3f9e5f" />
          <circle cx="-6" cy="4" r="7" fill="#4fae6d" />
        </g>
      ))}
    </svg>
  );
}
