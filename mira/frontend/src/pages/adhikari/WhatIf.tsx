import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet, apiPost } from "../../api/client";
import { useStore } from "../../state/store";
import { ErrorState, Skeleton } from "../../components/ui";
import { Info } from "../../components/Info";
import PageHero from "../../components/PageHero";
import { openMitraBot } from "../../components/MitraBot";
import { BAND_COLOR, SECTOR_ICON, sectorLabel, type Band } from "../../lib/format";

const VillageMap = lazy(() => import("../../three/VillageMap"));

const PRESETS = [
  { icon: "🌤️", en: ["Mild Dry Spell", "Moderate rainfall deficit"], hi: ["हल्की सूखी अवधि", "मध्यम वर्षा कमी"], rain: 30, price: 5 },
  { icon: "🪙", en: ["Feed Price Spike", "Rising feed / input costs"], hi: ["दाना महँगा", "बढ़ती लागत"], rain: 0, price: 25 },
  { icon: "📅", en: ["Delayed Payments", "Slower repayments from buyers"], hi: ["भुगतान में देरी", "ख़रीदारों से धीमे भुगतान"], rain: 15, price: 10 },
  { icon: "📉", en: ["Commodity Shock", "Unexpected drop in commodity prices"], hi: ["कमोडिटी झटका", "दामों में अचानक गिरावट"], rain: 10, price: 30 },
];

export default function WhatIf() {
  const { t } = useTranslation();
  const { lang } = useStore();
  const [rain, setRain] = useState(30);
  const [price, setPrice] = useState(15);
  const [preset, setPreset] = useState(0);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [meta, setMeta] = useState<Record<number, any>>({});

  useEffect(() => {
    apiGet("/api/enterprises?sort=risk").then((rows: any[]) => {
      const m: Record<number, any> = {};
      for (const r of rows) m[r.id] = r;
      setMeta(m);
    }).catch(() => {});
  }, []);

  async function run(r = rain, p = price) {
    setBusy(true);
    setErr("");
    try {
      setRes(await apiPost("/api/whatif", { rain_deficit_pct: r, price_shock_pct: p }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const analysis = useMemo(() => {
    if (!res) return null;
    const rows = res.enterprises.map((e: any) => ({ ...e, ...(meta[e.enterprise_id] ?? {}) }));
    const n = rows.length || 1;
    const avgB = rows.reduce((s: number, e: any) => s + e.old_score, 0) / n;
    const avgA = rows.reduce((s: number, e: any) => s + e.new_score, 0) / n;
    const cnt = (obj: any, b: Band) => obj?.[b] ?? 0;
    const affected = rows.filter((e: any) => e.new_band !== e.old_band || e.old_score - e.new_score > 5);
    const dist = (["green", "amber", "red"] as Band[]).map((b) => ({
      band: b,
      label: b === "green" ? "Healthy\n(70–100)" : b === "amber" ? "Watch\n(45–69)" : "At Risk\n(0–45)",
      Before: Math.round((cnt(res.before, b) / n) * 100),
      After: Math.round((cnt(res.after, b) / n) * 100),
    }));
    const bySector: Record<string, { d: number; c: number }> = {};
    const byVillage: Record<string, { b: number; a: number; c: number }> = {};
    for (const e of rows) {
      if (e.sector) {
        (bySector[e.sector] ??= { d: 0, c: 0 });
        bySector[e.sector].d += e.new_score - e.old_score;
        bySector[e.sector].c += 1;
      }
      if (e.village) {
        (byVillage[e.village] ??= { b: 0, a: 0, c: 0 });
        byVillage[e.village].b += e.old_score;
        byVillage[e.village].a += e.new_score;
        byVillage[e.village].c += 1;
      }
    }
    const sectors = Object.entries(bySector)
      .map(([s, v]) => ({ sector: s, delta: Math.round((v.d / v.c) * 10) / 10 }))
      .sort((a, b) => a.delta - b.delta);
    const villages = Object.entries(byVillage)
      .map(([v, x]) => ({
        village: v,
        before: Math.round((x.b / x.c) * 10) / 10,
        after: Math.round((x.a / x.c) * 10) / 10,
        change: Math.round(((x.a - x.b) / x.c) * 10) / 10,
      }))
      .sort((a, b) => a.change - b.change).slice(0, 5);
    const mapEnts = rows.filter((e: any) => e.name).map((e: any) => ({
      id: e.enterprise_id, name: e.name, sector: e.sector, village: e.village,
      district: e.district, score: e.new_score, band: e.new_band,
    }));
    return {
      rows, avgB: Math.round(avgB * 10) / 10, avgA: Math.round(avgA * 10) / 10,
      before: res.before, after: res.after, affected, dist, sectors, villages, mapEnts, n,
    };
  }, [res, meta]);

  const cnt = (obj: any, b: Band) => obj?.[b] ?? 0;
  const worstSector = analysis?.sectors[0];
  const worstVillage = analysis?.villages[0];

  return (
    <div className="space-y-3.5">
      <PageHero icon="🎛️" title={lang === "hi" ? "क्या-अगर परिदृश्य" : "What-if Scenario"}
        sub={lang === "hi"
          ? "बारिश घटे या लागत बढ़े — मीरा पोर्टफ़ोलियो तक दबाव पहुँचने से पहले दिखा देता है।"
          : "If rain falls or input costs jump — MIRA shows the stress before it reaches your portfolio."}
        from="#c2410c" to="#7c2d12" emojis={["🌧️", "🪙", "🧮"]}
        right={
          <button onClick={() => openMitraBot(lang === "hi" ? "क्या-अगर मॉडल कैसे काम करता है?" : "How does the what-if model work?")}
            className="press focus-ring chip bg-white/90 text-[#7c2d12] px-3.5 py-2 font-bold">
            ℹ️ {lang === "hi" ? "मॉडल के बारे में" : "About the model"}
          </button>
        } />

      <div className="grid xl:grid-cols-3 gap-3.5 items-start">
        {/* ── left: run a scenario ── */}
        <section className="card p-4 space-y-4 xl:sticky xl:top-6">
          <h2 className="font-display text-lg font-bold text-forest-800 flex items-center gap-1.5">
            {lang === "hi" ? "परिदृश्य चलाएँ" : "Run a scenario"}
            <Info text={lang === "hi"
              ? "वही मीरा मॉडल बदले हालात में दोबारा चलते हैं — असली डेटा नहीं बदलता।"
              : "The same MIRA models re-run under changed conditions — no real data is modified."} />
          </h2>

          <div>
            <p className="text-[12px] font-bold text-forest-800/60 mb-2">{lang === "hi" ? "एक प्रीसेट चुनें" : "Choose a preset"}</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p, i) => {
                const [head, body] = lang === "hi" ? p.hi : p.en;
                const active = preset === i;
                return (
                  <button key={p.icon}
                    onClick={() => { setPreset(i); setRain(p.rain); setPrice(p.price); void run(p.rain, p.price); }}
                    className={`press focus-ring rounded-xl p-3 text-left border transition-all ${
                      active ? "border-band-amber bg-band-amber-soft/60 shadow-soft" : "border-forest-800/10 bg-white hover:border-forest-800/25"}`}>
                    <span className="text-xl" aria-hidden>{p.icon}</span>
                    <p className="text-[13px] font-extrabold text-forest-800 leading-tight mt-1">{head}</p>
                    <p className="text-[10.5px] text-forest-800/55 leading-tight mt-0.5">{body}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* sliders */}
          <div className="rounded-xl border border-forest-800/10 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-forest-800 flex items-center gap-1.5">
                🌧️ {lang === "hi" ? "वर्षा कमी (%)" : "Rainfall Deficit (%)"}
              </span>
              <span className="chip bg-band-amber-soft text-terra-600 font-extrabold tabular-nums">−{rain}%</span>
            </div>
            <input type="range" min={0} max={60} step={5} value={rain}
              onChange={(e) => setRain(Number(e.target.value))}
              className="w-full accent-[#ea580c] mt-2" />
            <div className="flex justify-between text-[10px] text-forest-800/45 tabular-nums font-semibold">
              <span>−60%</span><span className="text-terra-600 font-extrabold">−{rain}%</span><span>0%</span>
            </div>
          </div>

          <div className="rounded-xl border border-forest-800/10 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-forest-800 flex items-center gap-1.5">
                🪙 {lang === "hi" ? "लागत मूल्य झटका (%)" : "Input Price Shock (%)"}
              </span>
              <span className="chip bg-[#ede9fe] text-[#7c3aed] font-extrabold tabular-nums">+{price}%</span>
            </div>
            <input type="range" min={0} max={50} step={5} value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full accent-[#7c3aed] mt-2" />
            <div className="flex justify-between text-[10px] text-forest-800/45 tabular-nums font-semibold">
              <span>0%</span><span className="text-[#7c3aed] font-extrabold">+{price}%</span><span>+50%</span>
            </div>
          </div>

          <label className="block rounded-xl border border-forest-800/12 px-3 py-2">
            <span className="text-[9.5px] uppercase tracking-wide font-bold text-forest-800/45 block">
              {lang === "hi" ? "दायरा (गाँव / क्षेत्र)" : "Scope (Villages / Sector)"}
            </span>
            <select className="w-full bg-transparent text-sm font-bold text-forest-800 focus:outline-none">
              <option>{lang === "hi" ? "सभी गाँव, सभी क्षेत्र" : "All Villages across all Sectors"}</option>
            </select>
          </label>

          <button onClick={() => void run()} disabled={busy}
            className="btn-primary focus-ring w-full py-3.5 disabled:opacity-60">
            {busy ? "⏳ " + (lang === "hi" ? "64 उद्यम पुनः स्कोर हो रहे…" : "re-scoring 64 enterprises…") : `▶ ${lang === "hi" ? "परिदृश्य चलाएँ" : "Run scenario"}`}
          </button>
          <p className="text-[11px] text-band-green font-semibold text-center -mt-1.5">
            ✅ {lang === "hi" ? "सिमुलेशन मॉडल रुझान और वर्तमान पोर्टफ़ोलियो डेटा पर आधारित है।" : "Simulation uses model trends and current portfolio data."}
          </p>
          {err && <ErrorState message={err} onRetry={() => run()} retryLabel={t("app.retry")} />}
        </section>

        {/* ── right: results ── */}
        <div className="xl:col-span-2 space-y-3.5">
          {!analysis && !busy && (
            <div className="card p-10 text-center text-forest-800/55 text-sm">
              <span className="text-4xl block mb-2" aria-hidden>🎛️</span>
              {lang === "hi" ? "प्रीसेट चुनें या स्लाइडर सेट करके चलाएँ — असर यहाँ दिखेगा।" : "Pick a preset or set the sliders and run — the impact appears here."}
            </div>
          )}
          {busy && !analysis && <Skeleton className="h-72" />}

          {analysis && (
            <>
              {/* impact summary */}
              <section className="card p-4">
                <h2 className="text-sm font-extrabold text-forest-800 mb-3">
                  {lang === "hi" ? "परिदृश्य प्रभाव सारांश" : "Scenario impact summary"}
                </h2>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 stagger">
                  {[
                    { icon: "🌐", bg: "#dbeafe", label: lang === "hi" ? "औसत स्कोर" : "Avg Score", b: analysis.avgB, a: analysis.avgA, dir: "▾", color: "#dc2626" },
                    { icon: "⚠️", bg: "#fee2e2", label: lang === "hi" ? "जोखिम में" : "At Risk", b: cnt(analysis.before, "red"), a: cnt(analysis.after, "red"), dir: "▾", color: "#dc2626" },
                    { icon: "👁️", bg: "#fef3c7", label: lang === "hi" ? "निगरानी" : "Watch", b: cnt(analysis.before, "amber"), a: cnt(analysis.after, "amber"), dir: "▴", color: "#d97706" },
                    { icon: "👥", bg: "#ede9fe", label: lang === "hi" ? "प्रभावित उद्यम" : "Enterprises Affected", single: analysis.affected.length, sub: `${lang === "hi" ? "कुल" : "Of"} ${analysis.n} ${lang === "hi" ? "में से" : "enterprises"}` },
                  ].map((s: any) => (
                    <div key={s.label} className="rounded-xl border border-forest-800/8 bg-white p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="h-7 w-7 rounded-full flex items-center justify-center text-sm" style={{ background: s.bg }} aria-hidden>{s.icon}</span>
                        <p className="text-[11px] font-bold text-forest-800/60">{s.label}</p>
                      </div>
                      {s.single != null ? (
                        <>
                          <p className="text-2xl font-extrabold tabular-nums text-forest-800">— {s.single}</p>
                          <p className="text-[10.5px] text-forest-800/50">{s.sub}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-extrabold tabular-nums text-forest-800">
                            {s.b} <span className="text-forest-800/35">→</span>{" "}
                            <span style={{ color: s.color }}>{s.a} {s.dir}</span>
                          </p>
                          <p className="text-[10.5px] font-bold tabular-nums" style={{ color: s.color }}>
                            {lang === "hi" ? "बदलाव" : "Change"} {s.a - s.b > 0 ? "+" : ""}{Math.round((s.a - s.b) * 10) / 10}
                          </p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid lg:grid-cols-2 gap-3.5">
                {/* distribution */}
                <section className="card p-4">
                  <h2 className="text-sm font-extrabold text-forest-800 mb-1">
                    {lang === "hi" ? "स्कोर वितरण: पहले बनाम बाद" : "Score distribution: Before vs After"}
                  </h2>
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={analysis.dist} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barGap={4}>
                      <CartesianGrid vertical={false} stroke="rgba(20,83,45,0.07)" />
                      <XAxis dataKey="label" tick={{ fill: "rgba(20,83,45,0.55)", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis unit="%" tick={{ fill: "rgba(20,83,45,0.5)", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip content={({ active, payload, label }: any) => active && payload?.length ? (
                        <div className="card px-2.5 py-1.5 text-xs tabular-nums">
                          <b>{String(label).split("\n")[0]}</b>
                          {payload.map((p: any) => <p key={p.dataKey}>{p.dataKey}: <b>{p.value}%</b></p>)}
                        </div>
                      ) : null} />
                      <Bar dataKey="Before" fill="#15803d" radius={[4, 4, 0, 0]} maxBarSize={34}
                        label={{ position: "top", fontSize: 10, fill: "#15803d", formatter: (v: any) => `${v}%` }} />
                      <Bar dataKey="After" fill="#ea8c00" radius={[4, 4, 0, 0]} maxBarSize={34}
                        label={{ position: "top", fontSize: 10, fill: "#b45309", formatter: (v: any) => `${v}%` }} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 justify-center text-[11px] font-bold text-forest-800/70">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#15803d" }} /> Before</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#ea8c00" }} /> After</span>
                  </div>
                </section>

                {/* sector impact */}
                <section className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-extrabold text-forest-800">
                      {lang === "hi" ? "क्षेत्र अनुसार असर" : "Impact by sector"}
                      <span className="font-medium text-forest-800/50 text-[11px]"> ({lang === "hi" ? "स्कोर बदलाव" : "Score change"})</span>
                    </h2>
                    <span className="text-[10.5px] font-bold text-band-red">{lang === "hi" ? "सबसे बुरा असर ↓" : "Worst impact ↓"}</span>
                  </div>
                  <ul className="space-y-2.5">
                    {analysis.sectors.map((s) => {
                      const width = Math.min(100, (Math.abs(s.delta) / Math.max(0.1, Math.abs(analysis.sectors[0].delta))) * 100);
                      return (
                        <li key={s.sector} className="flex items-center gap-2.5">
                          <span className="w-32 shrink-0 text-[12px] font-bold text-forest-800 truncate">
                            {SECTOR_ICON[s.sector]} {sectorLabel(s.sector, lang)}
                          </span>
                          <div className="flex-1 h-4 rounded-full bg-cream-100 overflow-hidden">
                            <div className="h-4 rounded-full grow-bar"
                              style={{ width: `${width}%`, background: s.delta < 0 ? "#fca5a5" : "#bbf7d0" }} />
                          </div>
                          <span className="w-12 text-right text-[12.5px] font-extrabold tabular-nums"
                            style={{ color: s.delta < 0 ? "#dc2626" : "#16a34a" }}>
                            {s.delta > 0 ? "+" : ""}{s.delta}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                {/* top impacted villages */}
                <section className="card p-4">
                  <h2 className="text-sm font-extrabold text-forest-800 mb-2">
                    {lang === "hi" ? "सबसे प्रभावित गाँव" : "Top impacted villages"}
                  </h2>
                  <table className="w-full text-[12.5px] tabular-nums">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-forest-800/45">
                        <th className="py-1 font-bold">{lang === "hi" ? "गाँव" : "Village"}</th>
                        <th className="py-1 font-bold text-right">{lang === "hi" ? "औसत (पहले)" : "Avg Score (Before)"}</th>
                        <th className="py-1 font-bold text-right">{lang === "hi" ? "औसत (बाद)" : "Avg Score (After)"}</th>
                        <th className="py-1 font-bold text-right">{lang === "hi" ? "बदलाव" : "Change"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.villages.map((v) => (
                        <tr key={v.village} className="border-t border-forest-800/6">
                          <td className="py-1.5 font-bold text-forest-800">
                            <Link to={`/a/enterprises?village=${v.village}`} className="hover:underline focus-ring">📍 {v.village}</Link>
                          </td>
                          <td className="py-1.5 text-right text-forest-800/75">{v.before}</td>
                          <td className="py-1.5 text-right text-forest-800/75">{v.after}</td>
                          <td className="py-1.5 text-right font-extrabold" style={{ color: v.change < 0 ? "#dc2626" : "#16a34a" }}>
                            {v.change > 0 ? "+" : ""}{v.change}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {/* impact map */}
                <section className="card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-extrabold text-forest-800">
                      {lang === "hi" ? "प्रभाव मानचित्र" : "Impact map"}
                      <span className="font-medium text-forest-800/50 text-[11px]"> ({lang === "hi" ? "परिदृश्य के बाद स्कोर" : "Score after scenario"})</span>
                    </h2>
                  </div>
                  {analysis.mapEnts.length > 0 ? (
                    <Suspense fallback={<Skeleton className="h-56" />}>
                      <VillageMap enterprises={analysis.mapEnts} />
                    </Suspense>
                  ) : <Skeleton className="h-56" />}
                  <div className="flex gap-3.5 justify-center mt-1.5 text-[10.5px] font-bold text-forest-800/70">
                    <span>{lang === "hi" ? "परिदृश्य के बाद स्कोर" : "Score after scenario"}:</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.green }} />70–100</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.amber }} />45–69</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.red }} />0–45</span>
                  </div>
                </section>
              </div>

              {/* suggested actions */}
              <section className="card p-4">
                <h2 className="text-sm font-extrabold text-forest-800 mb-3">
                  {lang === "hi" ? "अधिकारी के लिए सुझावित कार्रवाई" : "Suggested officer actions"}
                </h2>
                <div className="grid md:grid-cols-3 gap-2.5 stagger">
                  {[
                    worstSector && {
                      icon: SECTOR_ICON[worstSector.sector] ?? "🐔",
                      head: lang === "hi"
                        ? `${worstVillage?.village ?? ""} में ${sectorLabel(worstSector.sector, "hi")} इकाइयों को प्राथमिकता दें`
                        : `Prioritize ${sectorLabel(worstSector.sector, "en").toLowerCase()} units in ${worstVillage?.village ?? "affected villages"}`,
                      body: lang === "hi" ? "सबसे बड़ा स्कोर गिराव इसी क्षेत्र में।" : `Largest score drop (${worstSector.delta}) and rising input costs.`,
                    },
                    rain > 0 && {
                      icon: "🐄",
                      head: lang === "hi" ? "सूखा-संवेदनशील डेयरी समूहों का दौरा करें" : "Visit drought-sensitive dairy clusters",
                      body: lang === "hi" ? "पानी और चारे की उपलब्धता जाँचें।" : "Assess water stress and fodder availability.",
                    },
                    price > 0 && {
                      icon: "📔",
                      head: lang === "hi" ? "उच्च-लागत उद्यमों को सलाह भेजें" : "Send advisory to high-input enterprises",
                      body: lang === "hi" ? "लागत नियंत्रण और कार्यशील पूँजी पर मार्गदर्शन।" : "Guide on cost control and working capital.",
                    },
                  ].filter(Boolean).map((a: any, i: number) => (
                    <button key={i}
                      onClick={() => openMitraBot(lang === "hi"
                        ? `इस परिदृश्य (बारिश −${rain}%, लागत +${price}%) के लिए विस्तृत योजना बनाएँ: ${a.head}`
                        : `Under this scenario (rain −${rain}%, input costs +${price}%), draft a concrete plan for: ${a.head}`)}
                      className="press focus-ring lift rounded-xl border border-forest-800/8 bg-cream-50 p-3.5 text-left flex items-start gap-3">
                      <span className="h-6 w-6 rounded-full bg-terra-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5"
                        aria-hidden>{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-[13px] font-extrabold text-forest-800 leading-tight">{a.head}</p>
                        <p className="text-[11.5px] text-forest-800/60 mt-1">{a.body}</p>
                      </div>
                      <span className="text-2xl" aria-hidden>{a.icon}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
