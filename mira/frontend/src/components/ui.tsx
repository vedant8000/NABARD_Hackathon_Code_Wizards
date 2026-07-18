/** Shared UI primitives: Card, StatTile, Badge, ScoreGauge, TrendArrow,
 * BigButton, EmptyState, Skeleton, OfflinePill. */
import type { ReactNode } from "react";
import { BAND_COLOR, BAND_SOFT, BAND_ICON, type Band, money } from "../lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function StatTile({ label, value, sub, accent, icon, tint }: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: string;
  icon?: string; tint?: "green" | "gold" | "blue" | "rose" | "violet";
}) {
  return (
    <div className={`card lift p-4 flex items-center gap-3 ${tint ? `tint-${tint}` : ""}`}>
      {icon && <span className="medallion bg-white/70" aria-hidden>{icon}</span>}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-wide text-forest-800/55">{label}</span>
        <span className="text-2xl font-extrabold leading-none" style={accent ? { color: accent } : undefined}>{value}</span>
        {sub && <span className="text-xs text-forest-800/70 truncate">{sub}</span>}
      </div>
    </div>
  );
}

export function BandBadge({ band, lang = "en", className = "" }: { band: Band; lang?: string; className?: string }) {
  const label = {
    green: lang === "hi" ? "सुरक्षित" : "Healthy",
    amber: lang === "hi" ? "सावधान" : "Watch",
    red: lang === "hi" ? "जोखिम" : "At risk",
  }[band];
  return (
    <span className={`chip ${className}`}
      style={{ background: BAND_SOFT[band], color: BAND_COLOR[band] }}
      role="status" aria-label={`Risk band: ${label}`}>
      <span aria-hidden>{BAND_ICON[band]}</span> {label}
    </span>
  );
}

/** SVG radial score gauge — red→amber→green spectrum ring (mockup style),
 * filled proportionally to the score. */
let _gaugeId = 0;
export function ScoreGauge({ score, band, size = 132 }: { score: number; band: Band; size?: number }) {
  const r = (size - 20) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0.02, Math.min(1, score / 100));
  const gid = `gauge-grad-${++_gaugeId}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`MIRA score ${Math.round(score)} out of 100`}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="45%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(20,83,45,0.09)" strokeWidth="11" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={`url(#${gid})`} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)" }}
      />
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central"
        className="font-display" fontSize={size * 0.28} fontWeight={700} fill="#14532d">
        {Math.round(score)}
      </text>
      <text x="50%" y="66%" textAnchor="middle" fontSize={size * 0.09} fill="#14532d" opacity={0.55}>
        / 100
      </text>
    </svg>
  );
}

export function TrendArrow({ dir, risky }: { dir: "up" | "down"; risky?: boolean }) {
  const color = risky ? "#dc2626" : "#16a34a";
  return (
    <span aria-label={dir === "up" ? "rising" : "falling"} style={{ color }}>
      {dir === "up" ? "▲" : "▼"}
    </span>
  );
}

export function BigButton({ icon, label, onClick, className = "", type = "button" }: {
  icon?: ReactNode; label: ReactNode; onClick?: () => void; className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick}
      className={`press focus-ring w-full flex items-center justify-center gap-3 rounded-2xl
        bg-forest-800 text-white text-lg font-bold py-4 shadow-lift
        hover:bg-forest-700 transition-colors ${className}`}>
      {icon && <span className="text-2xl" aria-hidden>{icon}</span>}
      {label}
    </button>
  );
}

export function MoneyText({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{money(value)}</span>;
}

export function EmptyState({ icon = "🌾", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center gap-2">
      <span className="text-4xl" aria-hidden>{icon}</span>
      <p className="font-semibold text-forest-800">{title}</p>
      {hint && <p className="text-sm text-forest-800/60">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-forest-800/10 ${className}`} aria-hidden />;
}

export function ErrorState({ message, onRetry, retryLabel = "Retry" }: {
  message: string; onRetry?: () => void; retryLabel?: string;
}) {
  return (
    <div className="card p-6 text-center flex flex-col items-center gap-3">
      <span className="text-3xl" aria-hidden>⚠️</span>
      <p className="text-sm text-forest-800/80">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="press focus-ring chip bg-forest-800 text-white px-4 py-2">
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function OfflinePill({ text }: { text: string }) {
  return (
    <div className="chip bg-amber-100 text-amber-900 border border-amber-300" role="status">
      <span aria-hidden>📴</span> {text}
    </div>
  );
}
