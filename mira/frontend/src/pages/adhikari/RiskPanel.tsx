import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "../../api/client";
import { useStore } from "../../state/store";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui";
import PageHero from "../../components/PageHero";
import { openMitraBot } from "../../components/MitraBot";
import { BAND_COLOR, SECTOR_ICON, type Band } from "../../lib/format";

const SIG_META: Record<string, { icon: string; bg: string; cause: string }> = {
  "EWS-01": { icon: "🐷", bg: "#fce7f3", cause: "Savings deposits stopped for 2 months" },
  "EWS-02": { icon: "❗", bg: "#fee2e2", cause: "Repayment delays detected" },
  "EWS-03": { icon: "📉", bg: "#fee2e2", cause: "Forecast shows negative cash flow" },
  "EWS-04": { icon: "📊", bg: "#ede9fe", cause: "Cash buffer running low" },
  "EWS-05": { icon: "⏳", bg: "#fef3c7", cause: "Decline in transaction velocity" },
  "EWS-06": { icon: "🌽", bg: "#fef3c7", cause: "Input cost spike for the sector" },
  "EWS-07": { icon: "⬇️", bg: "#dbeafe", cause: "Drop in output prices in local markets" },
  "EWS-08": { icon: "🌧️", bg: "#ffedd5", cause: "Rainfall deficit / heat stress likely" },
  "EWS-09": { icon: "💸", bg: "#fee2e2", cause: "Unusually large expense recorded" },
  "EWS-10": { icon: "🎯", bg: "#dcfce7", cause: "High exposure to a single buyer" },
  "EWS-99": { icon: "⚠️", bg: "#e2e8f0", cause: "Unusual pattern in enterprise data" },
};

const SEV_LABEL: Record<string, { en: string; color: string }> = {
  red: { en: "High", color: "#dc2626" },
  amber: { en: "Medium", color: "#d97706" },
  info: { en: "Low", color: "#16a34a" },
};

export default function RiskPanel() {
  const { t } = useTranslation();
  const { lang } = useStore();
  const nav = useNavigate();
  const [groups, setGroups] = useState<any[] | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [severity, setSeverity] = useState("");
  const [q, setQ] = useState("");
  const [grouped, setGrouped] = useState(true);
  const [err, setErr] = useState("");
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  const load = () => {
    setErr("");
    apiGet("/api/alerts").then(setGroups).catch((e) => setErr(e.message));
    apiGet("/api/enterprises?sort=risk").then((rows: any[]) => {
      const m: Record<number, number> = {};
      for (const r of rows) m[r.id] = Math.round(r.score);
      setScores(m);
    }).catch(() => {});
  };
  useEffect(load, []);

  const kpi = useMemo(() => {
    if (!groups) return null;
    const all = groups.flatMap((g) => g.alerts.map((a: any) => ({ ...a, severity: g.severity })));
    const open = all.filter((a) => !a.acked);
    return {
      open: open.length,
      high: open.filter((a) => a.severity === "red").length,
      medium: open.filter((a) => a.severity === "amber").length,
      low: open.filter((a) => a.severity === "info").length,
      affected: new Set(open.map((a) => a.enterprise_id)).size,
    };
  }, [groups]);

  const visible = useMemo(() => {
    if (!groups) return null;
    return groups
      .filter((g) => (!severity || g.severity === severity))
      .filter((g) => !q ||
        g.code.toLowerCase().includes(q.toLowerCase()) ||
        g.name.toLowerCase().includes(q.toLowerCase()) ||
        g.desc.toLowerCase().includes(q.toLowerCase()));
  }, [groups, severity, q]);

  const topRisks = useMemo(() => {
    if (!groups) return [];
    return [...groups].sort((a, b) => b.open - a.open).slice(0, 3);
  }, [groups]);

  async function ackAll(g: any) {
    for (const a of g.alerts.filter((a: any) => !a.acked)) {
      await apiPost(`/api/alerts/${a.id}/ack`, { note: "" });
    }
    load();
  }

  function exportCsv(g: any) {
    const rows = [
      ["code", "signal", "enterprise_id", "enterprise", "sector", "village", "message", "action", "acked"],
      ...g.alerts.map((a: any) => [
        g.code, g.name, a.enterprise_id, a.enterprise, a.sector, a.village,
        a.message_en, a.action_en, a.acked ? "yes" : "no",
      ]),
    ];
    const csv = rows.map((r) => r.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `MIRA_${g.code}_affected.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (err) return <ErrorState message={err} onRetry={load} retryLabel={t("app.retry")} />;

  return (
    <div className="space-y-3.5">
      <PageHero icon="🛡️" title={lang === "hi" ? "जोखिम पैनल" : "Risk Panel"}
        sub={lang === "hi"
          ? "एक जैसी चेतावनियाँ साथ — पूरे पोर्टफ़ोलियो के साझा जोखिम पैटर्न पर कार्रवाई करें।"
          : "Same warnings together — act on common risk patterns across your portfolio."}
        from="#b91c1c" to="#7f1d1d" emojis={["⚠️", "🌾", "🐄"]}
        right={
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}
            className="focus-ring rounded-xl bg-white/90 text-[#7f1d1d] font-bold px-3 py-2 text-sm">
            <option value="">{lang === "hi" ? "सभी गंभीरता" : "All severities"}</option>
            <option value="red">🔴 High</option>
            <option value="amber">🟠 Medium</option>
            <option value="info">🟢 Low</option>
          </select>
        } />

      {/* ── KPI row ── */}
      {kpi && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 stagger">
          {[
            { icon: "🔔", bg: "#fee2e2", label: lang === "hi" ? "खुली चेतावनियाँ" : "Open Alerts", v: kpi.open, color: "#b91c1c" },
            { icon: "📈", bg: "#fee2e2", label: "High", v: kpi.high, color: "#dc2626" },
            { icon: "🕒", bg: "#fef3c7", label: "Medium", v: kpi.medium, color: "#d97706" },
            { icon: "📉", bg: "#dcfce7", label: "Low", v: kpi.low, color: "#16a34a" },
            { icon: "👥", bg: "#ede9fe", label: lang === "hi" ? "प्रभावित उद्यम" : "Enterprises Affected", v: kpi.affected, color: "#7c3aed" },
          ].map((s) => (
            <div key={s.label} className="card lift p-3.5 flex items-center gap-3">
              <span className="h-10 w-10 rounded-full flex items-center justify-center text-lg shrink-0"
                style={{ background: s.bg }} aria-hidden>{s.icon}</span>
              <div className="leading-tight">
                <p className="text-[11px] font-bold text-forest-800/55">{s.label}</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: s.color }}>{s.v}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-3.5 items-start">
        {/* ── left: signals ── */}
        <div className="xl:col-span-2 space-y-3">
          {/* filter row */}
          <div className="card p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-52">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-800/40 text-sm" aria-hidden>🔍</span>
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={lang === "hi" ? "संकेत, कोड या कीवर्ड खोजें" : "Search signals, codes or keywords"}
                className="focus-ring w-full rounded-xl border border-forest-800/12 bg-cream-50 pl-9 pr-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-bold text-forest-800/70 cursor-pointer">
              <button role="switch" aria-checked={grouped} onClick={() => setGrouped((v) => !v)}
                className={`press h-5 w-9 rounded-full transition-colors relative ${grouped ? "bg-band-red" : "bg-forest-800/20"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${grouped ? "left-4.5 right-0.5" : "left-0.5"}`}
                  style={{ left: grouped ? "1.1rem" : "0.15rem" }} />
              </button>
              {lang === "hi" ? "संकेत अनुसार समूह" : "Group by signal"}
            </label>
            <button onClick={() => visible?.forEach((g) => exportCsv(g))}
              className="press focus-ring chip bg-cream-100 text-forest-800 !px-3 py-2">
              ⬇ {lang === "hi" ? "सूची निर्यात" : "Export list"}
            </button>
          </div>

          {!visible ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : visible.length === 0 ? (
            <EmptyState icon="🌱" title={lang === "hi" ? "कोई खुली चेतावनी नहीं" : "No open alerts"} />
          ) : (
            visible.map((g) => {
              const meta = SIG_META[g.code] ?? { icon: "🔔", bg: "#f3ede0", cause: g.desc };
              const open5 = g.alerts.filter((a: any) => !a.acked).slice(0, showAll[g.code] ? undefined : 5);
              const sev = SEV_LABEL[g.severity] ?? SEV_LABEL.info;
              const expanded = openCode === g.code;
              return (
                <section key={g.code}
                  className={`card overflow-hidden transition-all ${expanded ? "ring-1 ring-band-amber/40" : ""}`}>
                  <button onClick={() => setOpenCode(expanded ? null : g.code)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left focus-ring"
                    aria-expanded={expanded}>
                    <span className="h-9 w-9 rounded-full flex items-center justify-center text-base shrink-0"
                      style={{ background: meta.bg }} aria-hidden>{meta.icon}</span>
                    <span className="font-extrabold text-forest-800 text-[13.5px] w-20 shrink-0">{g.code}</span>
                    <span className="font-bold text-forest-800 text-[13.5px] w-40 shrink-0 hidden md:block">
                      {g.name.replace(/_/g, " ")}
                    </span>
                    <span className="flex-1 text-[13px] text-forest-800/65 truncate">{g.desc}</span>
                    <span className="chip !py-1 !text-[11px] tabular-nums shrink-0"
                      style={{ background: `${sev.color}18`, color: sev.color }}>
                      {g.open} {lang === "hi" ? "प्रभावित" : "affected"}
                    </span>
                    <span className="text-forest-800/40" aria-hidden>{expanded ? "⌃" : "⌄"}</span>
                  </button>

                  {expanded && (
                    <div className="border-t border-forest-800/8 bg-[#fffbf3] px-4 py-3 fade-in">
                      <p className="text-[11.5px] font-bold text-forest-800/60 mb-2">
                        {lang === "hi" ? "प्रभावित उद्यम" : "Example affected enterprises"}
                        {!showAll[g.code] && g.open > 5 && (
                          <span className="font-medium text-forest-800/45"> ({lang === "hi" ? "शीर्ष 5" : "showing top 5"})</span>
                        )}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px] min-w-[620px]">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wide text-forest-800/45">
                              <th className="py-1 pr-2 font-bold">{lang === "hi" ? "उद्यम" : "Enterprise"}</th>
                              <th className="py-1 px-2 font-bold">{lang === "hi" ? "गाँव" : "Village"}</th>
                              <th className="py-1 px-2 font-bold">{lang === "hi" ? "क्षेत्र" : "Sector"}</th>
                              <th className="py-1 px-2 font-bold">{lang === "hi" ? "जोखिम स्कोर" : "Risk Score"}</th>
                              <th className="py-1 px-2 font-bold">{lang === "hi" ? "संभावित कारण" : "Likely Cause"}</th>
                              <th className="py-1 pl-2 font-bold">{lang === "hi" ? "कार्रवाई" : "Action"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {open5.map((a: any, i: number) => {
                              const sc = scores[a.enterprise_id];
                              const scBand: Band = sc == null ? "amber" : sc >= 70 ? "green" : sc >= 45 ? "amber" : "red";
                              const actions = [
                                { label: lang === "hi" ? "दौरा तय करें" : "Schedule Visit", fn: () => nav(`/a/enterprises/${a.enterprise_id}`) },
                                { label: lang === "hi" ? "सलाह भेजें" : "Send Advice", fn: () => openMitraBot(`Draft a short SMS advisory (in simple words) for ${a.enterprise} in ${a.village} about: ${a.message_en} Suggested action: ${a.action_en}`) },
                              ];
                              const act = actions[i % 2];
                              return (
                                <tr key={a.id} className="border-t border-forest-800/6">
                                  <td className="py-1.5 pr-2">
                                    <Link to={`/a/enterprises/${a.enterprise_id}`}
                                      className="font-bold text-forest-800 hover:underline focus-ring">
                                      {SECTOR_ICON[a.sector] ?? "🏠"} {a.enterprise}
                                    </Link>
                                  </td>
                                  <td className="py-1.5 px-2 text-forest-800/70">{a.village}</td>
                                  <td className="py-1.5 px-2 text-forest-800/70 capitalize">{String(a.sector ?? "").replace("_", " ")}</td>
                                  <td className="py-1.5 px-2">
                                    <span className="chip !py-0.5 !px-2 !text-[11px] tabular-nums"
                                      style={{ background: `${BAND_COLOR[scBand]}1c`, color: BAND_COLOR[scBand] }}>
                                      {sc ?? "—"}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-forest-800/65">{meta.cause}</td>
                                  <td className="py-1.5 pl-2">
                                    <button onClick={act.fn}
                                      className="press focus-ring chip border border-band-green/30 bg-band-green-soft text-band-green !px-2.5 !text-[11px]">
                                      {act.label}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex gap-2">
                          <button onClick={() => exportCsv(g)}
                            className="press focus-ring chip bg-cream-100 text-forest-800 !text-[11px]">⬇ Export</button>
                          <button onClick={() => void ackAll(g)}
                            className="press focus-ring chip bg-band-green-soft text-band-green !text-[11px]">✓ {t("officer.ackAll")}</button>
                        </div>
                        {g.open > 5 && (
                          <button onClick={() => setShowAll((s) => ({ ...s, [g.code]: !s[g.code] }))}
                            className="press focus-ring text-[12px] font-bold text-band-amber">
                            {showAll[g.code]
                              ? (lang === "hi" ? "कम दिखाएँ" : "Show less")
                              : `${lang === "hi" ? "सभी देखें" : "View all"} ${g.open} ${lang === "hi" ? "प्रभावित उद्यम" : "affected enterprises"} ›`}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        {/* ── right rail: top recurring risks ── */}
        <aside className="card p-4 space-y-3 xl:sticky xl:top-6">
          <h2 className="text-sm font-extrabold text-forest-800 flex items-center gap-2">
            📊 {lang === "hi" ? "इस सप्ताह के प्रमुख जोखिम" : "Top recurring risks this week"}
          </h2>
          {topRisks.map((g, i) => {
            const meta = SIG_META[g.code] ?? { icon: "🔔", bg: "#f3ede0", cause: g.desc };
            const tint = ["#fff1f0", "#fff7ed", "#f5f3ff"][i] ?? "#f8fafc";
            const titleColor = ["#dc2626", "#ea580c", "#7c3aed"][i] ?? "#334155";
            return (
              <div key={g.code} className="rounded-xl p-3.5 border border-forest-800/6" style={{ background: tint }}>
                <div className="flex items-start gap-2.5">
                  <span className="h-9 w-9 rounded-full bg-white shadow-soft flex items-center justify-center text-base shrink-0"
                    aria-hidden>{meta.icon}</span>
                  <div>
                    <p className="text-[13.5px] font-extrabold" style={{ color: titleColor }}>
                      {g.name.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}
                    </p>
                    <p className="text-[12px] text-forest-800/70 mt-0.5 leading-snug">
                      {g.open} {lang === "hi" ? "उद्यम प्रभावित" : "enterprises affected"} · {g.desc}
                    </p>
                    <p className="text-[10.5px] font-extrabold uppercase tracking-wide mt-2" style={{ color: titleColor }}>
                      {lang === "hi" ? "सुझावित कार्रवाई" : "Recommended action"}
                    </p>
                    <p className="text-[12px] text-forest-800/75 leading-snug">
                      {g.alerts[0]?.action_en ?? meta.cause}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <button onClick={() => { setSeverity(""); setQ(""); setOpenCode(null); }}
            className="press focus-ring w-full rounded-xl border border-forest-800/12 bg-white px-3.5 py-2.5 text-sm font-bold text-forest-800 flex items-center justify-between">
            {lang === "hi" ? "पूरी जोखिम सूची देखें" : "View full risk watchlist"} <span aria-hidden>›</span>
          </button>
        </aside>
      </div>
    </div>
  );
}
