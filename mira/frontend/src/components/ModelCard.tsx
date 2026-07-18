/** "About the model" modal — honest numbers from the backtest report.
 * Shows forecast WAPE vs seasonal-naive baseline, classifier metrics,
 * and the transparent sub-score weights. */
import { useEffect, useState } from "react";
import { apiGet } from "../api/client";
import { Skeleton } from "./ui";

export default function ModelCard({ onClose }: { onClose: () => void }) {
  const [card, setCard] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet("/api/model/card").then(setCard).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const horizons = card?.report?.horizons ?? {};
  const clf = card?.report?.risk_classifier ?? {};
  const subs = card?.score_design?.sub_scores ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label="About the model">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative card w-full max-w-2xl max-h-[85dvh] overflow-y-auto p-6 fade-in">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-display text-xl font-bold text-forest-800">About the model</h2>
          <button onClick={onClose} className="press focus-ring chip bg-cream-200 text-forest-800">✕</button>
        </div>
        <p className="text-xs text-forest-800/55 mb-4">
          Honest numbers from an expanding-window backtest over the last 8 months of held-out data.
        </p>

        {err && <p className="text-sm text-band-red">{err}</p>}
        {!card && !err && <div className="space-y-2"><Skeleton className="h-40" /><Skeleton className="h-24" /></div>}

        {card && (
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-bold text-forest-800/70 mb-2">
                Cash-flow forecast — WAPE vs seasonal-naive baseline (lower is better)
              </h3>
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-forest-800/50">
                    <th className="py-1 font-semibold">Horizon</th>
                    <th className="py-1 font-semibold text-right">MIRA model</th>
                    <th className="py-1 font-semibold text-right">Baseline</th>
                    <th className="py-1 font-semibold text-right">Improvement</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(horizons).map(([h, m]: [string, any]) => (
                    <tr key={h} className="border-t border-forest-800/5">
                      <td className="py-1.5">+{h} month{h !== "1" ? "s" : ""}</td>
                      <td className="py-1.5 text-right font-semibold">{(m.wape_model * 100).toFixed(1)}%</td>
                      <td className="py-1.5 text-right text-forest-800/60">{(m.wape_seasonal_naive * 100).toFixed(1)}%</td>
                      <td className="py-1.5 text-right font-bold text-band-green">−{m.improvement_pct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {clf.auc != null && (
              <section>
                <h3 className="text-sm font-bold text-forest-800/70 mb-2">Stress classifier (3-month horizon)</h3>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="chip bg-cream-100 text-forest-800 tabular-nums">AUC {Number(clf.auc).toFixed(2)}</span>
                  {clf.avg_precision != null && (
                    <span className="chip bg-cream-100 text-forest-800 tabular-nums">Avg precision {Number(clf.avg_precision).toFixed(2)}</span>
                  )}
                  {clf.positive_rate_val != null && (
                    <span className="chip bg-cream-100 text-forest-800 tabular-nums">
                      Base stress rate {(clf.positive_rate_val * 100).toFixed(0)}%
                    </span>
                  )}
                  <span className="chip bg-cream-100 text-forest-800">Calibrated (sigmoid)</span>
                  <span className="chip bg-cream-100 text-forest-800">Explained with SHAP</span>
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-bold text-forest-800/70 mb-2">Transparent MIRA Score (not a black box)</h3>
              <ul className="space-y-1.5">
                {Object.entries(subs).map(([k, s]: [string, any]) => (
                  <li key={k} className="flex items-center gap-2 text-sm">
                    <span className="chip bg-forest-100 text-forest-800 tabular-nums w-14 justify-center">
                      {Math.round(s.weight * 100)}%
                    </span>
                    <span className="text-forest-800/80">{s.desc}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-forest-800/55 mt-2">
                Bands: Green ≥ 70 · Amber 45–69 · Red &lt; 45 · Trained on a pooled panel across all
                enterprises (solves cold-start for new members).
              </p>
            </section>

            <p className="text-[11px] text-forest-800/45 border-t border-forest-800/8 pt-3">
              {card.score_design?.disclaimer ?? "Model outputs are decision-support, not a credit decision."}
              {" "}Synthetic demo data · NABARD Hackathon prototype.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
