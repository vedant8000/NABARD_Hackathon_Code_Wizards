import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { RiskDonut } from "../../components/charts";
import { ErrorState, Skeleton } from "../../components/ui";
import { Info } from "../../components/Info";
import PageHero from "../../components/PageHero";
import { BAND_COLOR, SECTOR_ICON, sectorLabel } from "../../lib/format";

const VillageMap = lazy(() => import("../../three/VillageMap"));
const ModelCard = lazy(() => import("../../components/ModelCard"));

const MONTHS_BACK = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];

export default function Overview() {
  const { t } = useTranslation();
  const { lang } = useStore();
  const [data, setData] = useState<any>(null);
  const [ents, setEnts] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [showModel, setShowModel] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const load = () => {
    setErr("");
    apiGet("/api/portfolio/overview").then(setData).catch((e) => setErr(e.message));
    apiGet("/api/enterprises?sort=risk").then(setEnts).catch(() => {});
  };
  useEffect(load, []);

  if (err) return <ErrorState message={err} onRetry={load} retryLabel={t("app.retry")} />;
  if (!data) {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        <Skeleton className="h-24 md:col-span-4" />
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        <Skeleton className="h-80 md:col-span-4" />
      </div>
    );
  }

  const { bands } = data;
  const healthyPct = Math.round((bands.green / data.total) * 100);
  // demo trend: deterministic 6-month improvement ending at today's average
  const trend = [-10.3, -8.4, -5.9, -3.6, -1.7, 0].map((d, i) => ({
    m: MONTHS_BACK[i], score: Math.round((data.avg_score + d) * 10) / 10,
  }));
  const vsLastMonth = Math.round((trend[5].score - trend[4].score) * 10) / 10;
  const improvementTotal = Math.round((trend[5].score - trend[0].score) * 10) / 10;
  const visits = (ents ?? []).slice(0, 4);
  const sectorRows = data.sector_matrix.map((r: any) => ({ ...r, total: r.green + r.amber + r.red }));

  return (
    <div className="space-y-4">
      <PageHero icon="📊" title={lang === "hi" ? "पोर्टफ़ोलियो अवलोकन" : "Portfolio Overview"}
        sub={`${data.total} ${lang === "hi" ? "उद्यम" : "enterprises"} • ${bands.red} ${lang === "hi" ? "जोखिम में" : "at risk"} • ${bands.amber} ${lang === "hi" ? "निगरानी में" : "watch"} • ${lang === "hi" ? "पहली छूटी किस्त से पहले दबाव पकड़ें" : "catch stress before the first missed EMI"}`}
        from="#166534" to="#0f3d22" emojis={["🏘️", "🌾", "🐄"]}
        right={
          <button onClick={() => setShowModel(true)}
            className="press focus-ring chip bg-white/90 text-forest-800 px-3.5 py-2 font-bold">
            ℹ️ {lang === "hi" ? "मॉडल के बारे में" : "About the model"}
          </button>
        } />
      {showModel && <Suspense fallback={null}><ModelCard onClose={() => setShowModel(false)} /></Suspense>}

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 stagger">
        <div className="card lift tint-green p-4">
          <p className="overline !text-forest-700">{lang === "hi" ? "कुल उद्यम" : "Total Enterprises"}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="medallion bg-white/80" aria-hidden>🏘️</span>
            <div>
              <p className="text-3xl font-extrabold text-forest-800 leading-none tabular-nums">{data.total}</p>
              <p className="text-xs text-forest-800/60 mt-1">{lang === "hi" ? `${data.villages.length} गाँवों में` : `Across ${data.villages.length} villages`}</p>
            </div>
          </div>
        </div>
        <div className="card lift tint-blue p-4">
          <p className="overline !text-[#1d4ed8]">{lang === "hi" ? "औसत मीरा स्कोर" : "Average MIRA Score"}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="medallion bg-white/80" aria-hidden>🎯</span>
            <div>
              <p className="text-3xl font-extrabold text-forest-800 leading-none tabular-nums">
                {data.avg_score}<span className="text-sm font-bold text-forest-800/50"> /100</span>
              </p>
              <p className="text-xs font-bold text-band-green mt-1">↑ {vsLastMonth} {lang === "hi" ? "पिछले माह से" : "vs last month"}</p>
            </div>
          </div>
        </div>
        <div className="card lift p-4" style={{ background: "linear-gradient(135deg,#fdfaf1,#faf3df)" }}>
          <p className="overline">{lang === "hi" ? "बैंड विभाजन" : "Band Split"}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="medallion bg-white/80" aria-hidden>🚦</span>
            <div className="flex-1">
              <div className="flex gap-3 text-2xl font-extrabold tabular-nums leading-none">
                <span style={{ color: BAND_COLOR.green }}>{bands.green}</span>
                <span style={{ color: BAND_COLOR.amber }}>{bands.amber}</span>
                <span style={{ color: BAND_COLOR.red }}>{bands.red}</span>
              </div>
              <div className="flex gap-2.5 text-[9.5px] font-bold text-forest-800/55 mt-1 uppercase tracking-wide">
                <span>● {lang === "hi" ? "स्वस्थ" : "Healthy"}</span>
                <span>● {lang === "hi" ? "निगरानी" : "Watch"}</span>
                <span>● {lang === "hi" ? "जोखिम" : "At Risk"}</span>
              </div>
              <p className="text-xs text-forest-800/60 mt-1">{healthyPct}% {lang === "hi" ? "स्वस्थ" : "Healthy"}</p>
            </div>
          </div>
        </div>
        <div className="card lift tint-rose p-4">
          <p className="overline !text-band-red">{lang === "hi" ? "खुली चेतावनियाँ" : "Open Alerts"}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="medallion bg-white/80" aria-hidden>🔔</span>
            <div>
              <p className="text-3xl font-extrabold text-band-red leading-none tabular-nums">{data.open_alerts}</p>
              <p className="text-xs text-forest-800/60 mt-1">
                {lang === "hi" ? "जोखिम पैनल में देखें" : "Review in Risk Panel"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── analytics row ── */}
      <div className="grid lg:grid-cols-3 gap-3">
        <section className="card p-4 flex flex-col">
          <h2 className="text-sm font-bold text-forest-800 mb-2 flex items-center gap-1.5">
            {lang === "hi" ? "जोखिम वितरण" : "Risk Distribution"}
            <Info text={lang === "hi" ? "बैंड-वार बँटवारा: हरा ≥70, नारंगी 45–69, लाल <45।" : "Split by band: Green ≥70, Amber 45–69, Red <45."} />
          </h2>
          <RiskDonut bands={bands} lang={lang} size={170} />
          <p className="mt-auto pt-2 text-xs font-semibold text-band-green bg-band-green-soft rounded-lg px-2.5 py-1.5">
            📈 {lang === "hi" ? "इस माह 6 उद्यमों का जोखिम घटा" : "Risk improved for 6 enterprises this month"}
          </p>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-bold text-forest-800 mb-2 flex items-center gap-1.5">
            {lang === "hi" ? "क्षेत्र और बैंड अनुसार उद्यम" : "Enterprises by Sector & Band"}
            <Info text={lang === "hi" ? "एक क्षेत्र में कई नारंगी/लाल = साझा कारण (दाम, मौसम)।" : "Several Amber/Red in one sector points to a shared cause (prices, weather)."} />
          </h2>
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-forest-800/50">
                <th className="py-1 font-bold">{lang === "hi" ? "क्षेत्र" : "Sector"}</th>
                <th className="py-1 font-bold text-center" style={{ color: BAND_COLOR.green }}>{lang === "hi" ? "स्वस्थ" : "Healthy"}</th>
                <th className="py-1 font-bold text-center" style={{ color: BAND_COLOR.amber }}>{lang === "hi" ? "निगरानी" : "Watch"}</th>
                <th className="py-1 font-bold text-center" style={{ color: BAND_COLOR.red }}>{lang === "hi" ? "जोखिम" : "At Risk"}</th>
                <th className="py-1 font-bold text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {sectorRows.map((r: any) => (
                <tr key={r.sector} className="border-t border-forest-800/6">
                  <td className="py-1.5 font-semibold text-forest-800">
                    <span aria-hidden className="mr-1">{SECTOR_ICON[r.sector]}</span>{sectorLabel(r.sector, lang)}
                  </td>
                  <td className="py-1.5 text-center font-bold" style={{ color: BAND_COLOR.green }}>{r.green}</td>
                  <td className="py-1.5 text-center font-bold" style={{ color: r.amber ? BAND_COLOR.amber : "#9aa5a0" }}>{r.amber}</td>
                  <td className="py-1.5 text-center font-bold" style={{ color: r.red ? BAND_COLOR.red : "#9aa5a0" }}>{r.red}</td>
                  <td className="py-1.5 text-center font-bold text-forest-800">{r.total}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-forest-800/15">
                <td className="py-1.5 font-extrabold text-forest-800">TOTAL</td>
                <td className="py-1.5 text-center font-extrabold" style={{ color: BAND_COLOR.green }}>{bands.green}</td>
                <td className="py-1.5 text-center font-extrabold" style={{ color: BAND_COLOR.amber }}>{bands.amber}</td>
                <td className="py-1.5 text-center font-extrabold" style={{ color: BAND_COLOR.red }}>{bands.red}</td>
                <td className="py-1.5 text-center font-extrabold text-forest-800">{data.total}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-forest-800 flex items-center gap-1.5">
              {lang === "hi" ? "स्कोर रुझान" : "Score Trend"}
              <Info text={lang === "hi" ? "पोर्टफ़ोलियो का औसत मीरा स्कोर, माह-दर-माह।" : "Average portfolio MIRA score, month over month."} />
            </h2>
            <span className="chip bg-cream-100 text-forest-800/70 !text-[10px]">{lang === "hi" ? "पिछले 6 माह" : "Last 6 months"} ▾</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={trend} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(20,83,45,0.07)" />
              <XAxis dataKey="m" tick={{ fill: "rgba(20,83,45,0.5)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "rgba(20,83,45,0.5)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={({ active, payload, label }: any) => active && payload?.length ? (
                <div className="card px-2 py-1 text-xs tabular-nums">{label}: <b>{payload[0].value}</b></div>
              ) : null} />
              <Area dataKey="score" stroke="#15803d" strokeWidth={2.5} fill="#15803d" fillOpacity={0.14}
                dot={{ r: 3, fill: "#15803d" }} label={{ position: "top", fontSize: 9.5, fill: "#14532d", formatter: (v: any) => v }} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mt-auto pt-2 text-xs font-semibold text-band-green">
            ↑ {improvementTotal} {lang === "hi" ? "अंक सुधार 6 माह में" : "point improvement over 6 months"}
          </p>
        </section>
      </div>

      {/* ── map + visits row ── */}
      <div className="grid lg:grid-cols-3 gap-3">
        <section className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <div>
              <h2 className="text-sm font-bold text-forest-800 flex items-center gap-1.5">
                🗺️ {lang === "hi" ? "गाँव पोर्टफ़ोलियो मानचित्र" : "Village Portfolio Map"}
                <Info text={lang === "hi" ? "हर मार्कर एक उद्यम — रंग बैंड, ऊँचाई जोखिम। क्लिक से 360° खुलता है।" : "Each marker is an enterprise — colour = band, height = risk. Click one to open its 360°."} />
              </h2>
              <p className="text-[11px] text-forest-800/55">
                {lang === "hi" ? "आपके गाँवों में उद्यम वितरण का दृश्य" : "Isometric view of enterprise distribution across your villages"}
              </p>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] font-bold">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_COLOR.green }} />{lang === "hi" ? "स्वस्थ" : "Healthy"}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_COLOR.amber }} />{lang === "hi" ? "निगरानी" : "Watch"}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_COLOR.red }} />{lang === "hi" ? "जोखिम" : "At Risk"}</span>
              <button onClick={() => setShowMap((v) => !v)}
                className="press focus-ring chip bg-forest-100 text-forest-800">
                {showMap ? (lang === "hi" ? "चिप देखें" : "Chip view") : (lang === "hi" ? "पूरा मानचित्र" : "View full map")} ↗
              </button>
            </div>
          </div>

          {showMap && ents ? (
            <Suspense fallback={<Skeleton className="h-72" />}>
              <VillageMap enterprises={ents} />
            </Suspense>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 stagger">
              {data.villages.map((v: any) => {
                const healthy = v.n - v.reds - v.ambers;
                return (
                  <Link key={`${v.district}-${v.village}`} to={`/a/enterprises?village=${v.village}`}
                    className="press focus-ring lift rounded-xl p-3 border border-forest-800/8 bg-gradient-to-br from-white to-forest-50">
                    <p className="font-bold text-sm text-forest-800">📍 {v.village}</p>
                    <p className="text-[10.5px] text-forest-800/55">{v.district} · avg {v.avg_score}</p>
                    <div className="flex gap-2.5 mt-1.5 text-[12px] font-extrabold tabular-nums">
                      <span style={{ color: BAND_COLOR.green }}>● {healthy}</span>
                      <span style={{ color: v.ambers ? BAND_COLOR.amber : "#9aa5a0" }}>● {v.ambers}</span>
                      <span style={{ color: v.reds ? BAND_COLOR.red : "#9aa5a0" }}>● {v.reds}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="card p-4 flex flex-col">
          <h2 className="text-sm font-bold text-forest-800 mb-2.5 flex items-center gap-2">
            {lang === "hi" ? "आज के सुझाए दौरे" : "Today's Recommended Visits"}
            <span className="h-5 min-w-5 px-1 rounded-full bg-band-red text-white text-[11px] font-bold flex items-center justify-center">
              {visits.length}
            </span>
          </h2>
          <ul className="space-y-2 flex-1 stagger">
            {visits.map((e: any) => (
              <li key={e.id} className="rounded-xl border border-forest-800/8 bg-white p-2.5 flex items-center gap-2.5">
                <span className={`chip !py-0.5 !px-1.5 !text-[9px] uppercase ${
                  e.band === "red" ? "bg-band-red text-white" : "bg-band-amber text-white"}`}>
                  {e.band === "red" ? "HIGH" : "MEDIUM"}
                </span>
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="text-[13px] font-bold text-forest-800 truncate">{e.name}</p>
                  <p className="text-[10.5px] text-forest-800/55">{e.village}</p>
                </div>
                <div className="text-right leading-none">
                  <p className="text-[9px] uppercase text-forest-800/45 font-bold">Score</p>
                  <p className="text-base font-extrabold tabular-nums" style={{ color: BAND_COLOR[e.band as keyof typeof BAND_COLOR] }}>
                    {Math.round(e.score)}
                  </p>
                </div>
                <Link to={`/a/enterprises/${e.id}`}
                  className="press focus-ring chip bg-forest-800 text-white !px-3">{lang === "hi" ? "दौरा" : "Visit"}</Link>
              </li>
            ))}
          </ul>
          <Link to="/a/enterprises?band=red"
            className="press focus-ring mt-3 rounded-xl bg-cream-100 hover:bg-cream-200 px-3.5 py-2.5 text-sm font-bold text-forest-800 flex items-center justify-between">
            {lang === "hi" ? "सभी जोखिम व निगरानी देखें" : "View all at-risk & watchlist"} <span aria-hidden>›</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
