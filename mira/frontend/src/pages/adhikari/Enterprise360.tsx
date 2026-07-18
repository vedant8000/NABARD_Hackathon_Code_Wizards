import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "../../api/client";
import { useStore } from "../../state/store";
import { CashFlowBars, ForecastChart } from "../../components/charts";
import { BandBadge, ErrorState, ScoreGauge, Skeleton } from "../../components/ui";
import { Info } from "../../components/Info";
import ChatThread from "../../components/ChatThread";
import { BAND_COLOR, SECTOR_ICON, dateLabel, money, sectorLabel, type Band } from "../../lib/format";

const SUB_LABELS: Record<string, [string, string, number]> = {
  s1_cashflow: ["Cash-flow health", "नक़दी सेहत", 30],
  s2_repayment: ["Repayment discipline", "किस्त अनुशासन", 25],
  s3_digital: ["Digital trend", "डिजिटल रुझान", 15],
  s4_market: ["Market stress", "बाज़ार दबाव", 15],
  s5_climate: ["Climate exposure", "जलवायु जोखिम", 15],
};

export default function Enterprise360() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { lang, token } = useStore();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = () => {
    setErr("");
    apiGet(`/api/enterprises/${id}`).then(setD).catch((e) => setErr(e.message));
    apiGet("/api/messages/unread")
      .then((u: any) => setUnread(u.by_enterprise?.[Number(id)] ?? 0))
      .catch(() => {});
  };
  useEffect(load, [id]);

  if (err) return <ErrorState message={err} onRetry={load} retryLabel={t("app.retry")} />;
  if (!d) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;

  const band = d.band as Band;

  async function ack(alertId: number) {
    await apiPost(`/api/alerts/${alertId}/ack`, { note: "" });
    load();
  }
  async function addNote() {
    if (!note.trim()) return;
    await apiPost(`/api/enterprises/${id}/interventions`, { note });
    setNote("");
    load();
  }
  async function pdf() {
    const r = await fetch(`/api/reports/${id}/credit-passport`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <section className="card p-5 flex flex-wrap items-center gap-5">
        <ScoreGauge score={d.score} band={band} size={110} />
        <div className="flex-1 min-w-52">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-forest-800">
              <span aria-hidden className="mr-1">{SECTOR_ICON[d.enterprise.sector]}</span>
              {d.enterprise.name}
            </h1>
            <BandBadge band={band} lang={lang} />
          </div>
          <p className="text-sm text-forest-800/65 mt-0.5">
            {d.enterprise.type} · {sectorLabel(d.enterprise.sector, lang)} · {d.enterprise.village}, {d.enterprise.district}
          </p>
          <p className="text-xs text-forest-800/55 mt-1 tabular-nums">
            Stress prob (3m): <b>{(d.stress_prob_3m * 100).toFixed(0)}%</b> ·
            {d.outstanding > 0
              ? <> {lang === "hi" ? "बकाया" : "outstanding"} {money(d.outstanding)} · EMI {money(d.emi_amount)}</>
              : <> 🎉 {lang === "hi" ? "क़र्ज़ चुकाया" : "loan repaid"}</>} · streak {d.ontime_streak}m
          </p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {d.drivers?.map((dr: any) => (
              <span key={dr.feature}
                className="chip"
                style={{
                  background: dr.direction === "up" ? "#fee2e2" : "#dcfce7",
                  color: dr.direction === "up" ? BAND_COLOR.red : BAND_COLOR.green,
                }}>
                {dr.direction === "up" ? "▲" : "▼"} {lang === "hi" ? dr.label_hi : dr.label_en}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => { setShowChat(true); setUnread(0); }}
            className="press focus-ring chip bg-[#1d4ed8] text-white px-4 py-2.5 relative">
            💬 {lang === "hi" ? "संदेश भेजें" : "Message"}
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-band-red text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {unread}
              </span>
            )}
          </button>
          <button onClick={() => void pdf()}
            className="press focus-ring chip bg-forest-800 text-white px-4 py-2.5">
            📜 {t("officer.generatePassport")}
          </button>
        </div>
      </section>

      {showChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog" aria-modal="true" aria-label="Messages">
          <button className="absolute inset-0 bg-black/45" onClick={() => setShowChat(false)} aria-label="Close" />
          <div className="relative card w-full max-w-lg p-4 fade-in">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="h-10 w-10 rounded-full bg-cream-100 flex items-center justify-center text-lg" aria-hidden>
                {d ? "🌾" : "💬"}
              </span>
              <div className="flex-1 leading-tight">
                <p className="font-bold text-forest-800">{d?.enterprise?.name}</p>
                <p className="text-[11px] text-forest-800/55">
                  {d?.enterprise?.village} · {lang === "hi" ? "सीधा संदेश — उद्यमी को उनके लॉगिन में मिलेगा" : "Direct message — delivered to their MIRA login"}
                </p>
              </div>
              <button onClick={() => setShowChat(false)}
                className="press focus-ring chip bg-cream-200 text-forest-800">✕</button>
            </div>
            <ChatThread enterpriseId={Number(id)} height={400} />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        {/* sub-scores */}
        <section className="card p-4">
          <h2 className="text-sm font-bold text-forest-800/70 mb-3 flex items-center gap-1.5">
            {t("officer.subScores")}
            <Info text={lang === "hi"
              ? "मीरा स्कोर इन 5 भारित घटकों का योग है — कौन सा घटक स्कोर गिरा रहा है, यहीं दिखता है।"
              : "The MIRA Score is the weighted sum of these 5 components — this shows which one is dragging it down."} />
          </h2>
          <ul className="space-y-2.5">
            {Object.entries(SUB_LABELS).map(([k, [en, hi, w]]) => (
              <li key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-forest-800">{lang === "hi" ? hi : en}
                    <span className="text-forest-800/45"> · {w}%</span></span>
                  <span className="tabular-nums font-bold">{Math.round(d.sub_scores[k])}</span>
                </div>
                <div className="h-2 rounded-full bg-forest-800/8" role="img"
                  aria-label={`${en}: ${Math.round(d.sub_scores[k])} of 100`}>
                  <div className="h-2 rounded-full grow-bar"
                    style={{
                      width: `${d.sub_scores[k]}%`,
                      background: d.sub_scores[k] >= 70 ? BAND_COLOR.green : d.sub_scores[k] >= 45 ? BAND_COLOR.amber : BAND_COLOR.red,
                    }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* forecast */}
        <section className="card p-4">
          <h2 className="text-sm font-bold text-forest-800/70 mb-1">{t("officer.forecastTitle")}</h2>
          <ForecastChart history={d.history} forecast={d.forecast} lang={lang} height={210} />
        </section>

        {/* cash flow history */}
        <section className="card p-4">
          <h2 className="text-sm font-bold text-forest-800/70 mb-1">{t("officer.ledger")}</h2>
          <CashFlowBars history={d.history} lang={lang} height={200} />
        </section>

        {/* alerts + notes */}
        <section className="card p-4 space-y-3">
          <h2 className="text-sm font-bold text-forest-800/70">{t("officer.alertHistory")}</h2>
          <ul className="space-y-2 max-h-44 overflow-y-auto pr-1">
            {d.alerts.length === 0 && <li className="text-sm text-forest-800/55">—</li>}
            {d.alerts.map((a: any) => (
              <li key={a.id} className="flex items-start gap-2 text-sm">
                <span aria-hidden>{a.severity === "red" ? "🔴" : a.severity === "amber" ? "🟠" : "🔵"}</span>
                <div className="flex-1">
                  <p className={a.acked ? "line-through opacity-50" : ""}>
                    <b>{a.code}</b> {a.message_en}
                  </p>
                </div>
                {!a.acked && (
                  <button onClick={() => void ack(a.id)}
                    className="press focus-ring chip bg-band-green-soft text-band-green">✓</button>
                )}
              </li>
            ))}
          </ul>

          <h2 className="text-sm font-bold text-forest-800/70 pt-1">{t("officer.notes")}</h2>
          <ul className="space-y-1 max-h-28 overflow-y-auto text-xs text-forest-800/75">
            {d.interventions.map((n: any) => (
              <li key={n.id}>📝 <b>{n.officer}</b> · {dateLabel(n.at, lang)} — {n.note}</li>
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addNote(); }}>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t("officer.addNote")}
              className="focus-ring flex-1 rounded-xl border border-forest-800/15 px-3 py-2 text-sm" />
            <button type="submit" className="press focus-ring chip bg-forest-800 text-white px-3">＋</button>
          </form>
        </section>
      </div>
    </div>
  );
}
