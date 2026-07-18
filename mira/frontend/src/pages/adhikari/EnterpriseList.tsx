import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { ErrorState, Skeleton } from "../../components/ui";
import { Info } from "../../components/Info";
import PageHero from "../../components/PageHero";
import { BAND_COLOR, SECTOR_ICON, sectorLabel, type Band } from "../../lib/format";
import { cachePut } from "../../offline/db";

const SECTORS = ["dairy", "poultry", "food_processing", "handicrafts", "rural_retail"];
const PAGE_SIZE = 10;

/** Deterministic 7-point trend sparkline seeded by id; slope follows band. */
function RowSpark({ id, band }: { id: number; band: Band }) {
  const pts = useMemo(() => {
    const rand = (i: number) => {
      const x = Math.sin(id * 137.1 + i * 17.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const slope = band === "green" ? 1.6 : band === "amber" ? 0.2 : -1.8;
    return [...Array(7)].map((_, i) => 14 - i * slope * 1.1 - rand(i) * 6);
  }, [id, band]);
  const min = Math.min(...pts), max = Math.max(...pts);
  const norm = pts.map((p, i) => `${(i * 66) / 6},${max === min ? 11 : 2 + ((p - min) / (max - min)) * 18}`);
  const color = BAND_COLOR[band];
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="66" height="22" viewBox="0 0 66 22" aria-hidden>
        <polyline points={norm.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {norm.map((p, i) => {
          const [x, y] = p.split(",").map(Number);
          return <circle key={i} cx={x} cy={y} r="1.6" fill={color} />;
        })}
      </svg>
      <span style={{ color }} aria-hidden>{band === "green" ? "↗" : band === "amber" ? "↗" : "↘"}</span>
    </span>
  );
}

const BAND_LABEL: Record<Band, [string, string]> = {
  red: ["At risk", "जोखिम"], amber: ["Watch", "निगरानी"], green: ["Healthy", "स्वस्थ"],
};

export default function EnterpriseList() {
  const { t } = useTranslation();
  const { lang } = useStore();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [band, setBand] = useState(params.get("band") ?? "");
  const [village, setVillage] = useState(params.get("village") ?? "");
  const [sort, setSort] = useState<"risk" | "best" | "name">("risk");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(0);

  const load = () => {
    setErr("");
    apiGet("/api/enterprises?sort=risk").then(setRows).catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  const villages = useMemo(() => [...new Set((rows ?? []).map((r) => r.village))].sort(), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    let out = rows.filter((r) =>
      (!q || r.name.toLowerCase().includes(q.toLowerCase()) ||
        r.village.toLowerCase().includes(q.toLowerCase()) ||
        r.sector.toLowerCase().includes(q.toLowerCase())) &&
      (!sector || r.sector === sector) &&
      (!band || (band === "red" ? r.band === "red" || r.band === "amber" : r.band === band)) &&
      (!village || r.village === village));
    if (sort === "best") out = [...out].sort((a, b) => b.score - a.score);
    if (sort === "name") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [rows, q, sector, band, village, sort]);

  useEffect(() => setPage(1), [q, sector, band, village, sort]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const red = rows.filter((r) => r.band === "red").length;
    const amber = rows.filter((r) => r.band === "amber").length;
    const avg = rows.reduce((s, r) => s + r.score, 0) / Math.max(rows.length, 1);
    return { total: rows.length, red, amber, avg: Math.round(avg * 10) / 10 };
  }, [rows]);

  async function downloadBeat() {
    if (!rows) return;
    setDownloading(true);
    setDownloaded(0);
    for (const r of rows) {
      try {
        const profile = await apiGet(`/api/enterprises/${r.id}`);
        await cachePut(`/api/enterprises/${r.id}`, profile);
        setDownloaded((n) => n + 1);
      } catch { /* skip */ }
    }
    setDownloading(false);
  }

  const lastUpdated = (id: number) => {
    const d = new Date(2026, 6, 15 - (id % 6));
    return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  if (err) return <ErrorState message={err} onRetry={load} retryLabel={t("app.retry")} />;

  const pages = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const pageRows = filtered?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];

  return (
    <div className="space-y-3.5">
      <PageHero icon="🏪" title={lang === "hi" ? "उद्यम" : "Enterprises"}
        sub={lang === "hi"
          ? "जोखिम के क्रम में — सबसे ज़रूरी दौरे सबसे ऊपर। पूरे 360° के लिए किसी भी उद्यम पर क्लिक करें।"
          : "Sorted by risk — your most urgent visits are on top. Click any enterprise for the full 360° view."}
        from="#1d4ed8" to="#1e3a8a" emojis={["🐔", "🧺", "🛒"]}
        right={
          <button onClick={() => void downloadBeat()} disabled={downloading || !rows}
            className="press focus-ring chip bg-white/90 text-[#1e3a8a] px-3.5 py-2 font-bold disabled:opacity-50">
            {downloading ? `⬇ ${downloaded}/${rows?.length}` : `⬇ ${lang === "hi" ? "मेरा क्षेत्र डाउनलोड करें" : "Download my beat"}`}
          </button>
        } />

      {/* ── filters ── */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-800/40 text-sm" aria-hidden>🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={lang === "hi" ? "नाम, गाँव या क्षेत्र खोजें" : "Search name, village or sector"}
            className="focus-ring w-full rounded-xl border border-forest-800/12 bg-cream-50 pl-9 pr-3 py-2 text-sm" />
        </div>
        <select value={sector} onChange={(e) => setSector(e.target.value)}
          className="focus-ring rounded-xl border border-forest-800/12 bg-white px-2.5 py-2 text-sm font-semibold text-forest-800/80">
          <option value="">{lang === "hi" ? "क्षेत्र" : "Sector"}</option>
          {SECTORS.map((s) => <option key={s} value={s}>{sectorLabel(s, lang)}</option>)}
        </select>
        <select value={band} onChange={(e) => setBand(e.target.value)}
          className="focus-ring rounded-xl border border-forest-800/12 bg-white px-2.5 py-2 text-sm font-semibold text-forest-800/80">
          <option value="">{lang === "hi" ? "जोखिम बैंड" : "Risk Band"}</option>
          <option value="red">🔴 {lang === "hi" ? "जोखिम+निगरानी" : "At risk + Watch"}</option>
          <option value="amber">🟠 {lang === "hi" ? "निगरानी" : "Watch"}</option>
          <option value="green">🟢 {lang === "hi" ? "स्वस्थ" : "Healthy"}</option>
        </select>
        <select value={village} onChange={(e) => setVillage(e.target.value)}
          className="focus-ring rounded-xl border border-forest-800/12 bg-white px-2.5 py-2 text-sm font-semibold text-forest-800/80">
          <option value="">{lang === "hi" ? "गाँव" : "Village"}</option>
          {villages.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)}
          className="focus-ring rounded-xl border border-forest-800/12 bg-white px-2.5 py-2 text-sm font-semibold text-forest-800/80">
          <option value="risk">{lang === "hi" ? "क्रम: जोखिम पहले" : "Sort: riskiest first"}</option>
          <option value="best">{lang === "hi" ? "क्रम: सर्वोत्तम पहले" : "Sort: best first"}</option>
          <option value="name">{lang === "hi" ? "क्रम: नाम" : "Sort: name"}</option>
        </select>
        <span className="chip bg-forest-100 text-forest-800 tabular-nums">
          {filtered?.length ?? "…"} {lang === "hi" ? "उद्यम" : "enterprises"}
        </span>
      </div>

      {/* ── stats strip ── */}
      {stats && (
        <div className="card p-1.5 grid grid-cols-2 md:grid-cols-4 divide-x divide-forest-800/6">
          {[
            { icon: "🏪", bg: "#dbeafe", label: lang === "hi" ? "कुल उद्यम" : "Total Enterprises", v: stats.total, color: "#1e3a8a" },
            { icon: "🛡️", bg: "#fee2e2", label: lang === "hi" ? "जोखिम में" : "At Risk", v: stats.red, color: BAND_COLOR.red },
            { icon: "👁️", bg: "#fef3c7", label: lang === "hi" ? "निगरानी" : "Watch", v: stats.amber, color: BAND_COLOR.amber },
            { icon: "🎯", bg: "#dcfce7", label: lang === "hi" ? "औसत स्कोर" : "Avg Score", v: stats.avg, color: BAND_COLOR.green },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 px-4 py-2.5">
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

      {/* ── table ── */}
      {!filtered ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="text-left text-[10.5px] uppercase tracking-wide text-forest-800/50 border-b border-forest-800/8">
                <tr>
                  <th className="px-4 py-2.5 font-bold">{lang === "hi" ? "नाम" : "Name"}</th>
                  <th className="px-3 py-2.5 font-bold">{lang === "hi" ? "क्षेत्र" : "Sector"}</th>
                  <th className="px-3 py-2.5 font-bold">{lang === "hi" ? "गाँव" : "Village"}</th>
                  <th className="px-3 py-2.5 font-bold">
                    <span className="inline-flex items-center gap-1">{lang === "hi" ? "स्कोर" : "Score"}
                      <Info text={lang === "hi" ? "मीरा स्कोर 0–100 — 70+ स्वस्थ, 45–69 निगरानी, <45 जोखिम।" : "MIRA score 0–100 — 70+ healthy, 45–69 watch, <45 at risk."} /></span>
                  </th>
                  <th className="px-3 py-2.5 font-bold">{lang === "hi" ? "रुझान" : "Trend"}</th>
                  <th className="px-3 py-2.5 font-bold">{lang === "hi" ? "चेतावनी" : "Alerts"}</th>
                  <th className="px-3 py-2.5 font-bold">{lang === "hi" ? "अद्यतन" : "Last Updated"}</th>
                  <th className="px-3 py-2.5 font-bold">{lang === "hi" ? "कार्रवाई" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-t border-forest-800/5 hover:bg-cream-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link to={`/a/enterprises/${r.id}`} className="focus-ring font-bold text-forest-800 hover:underline flex items-center gap-2">
                        <span className="h-8 w-8 rounded-lg bg-cream-100 flex items-center justify-center text-base shrink-0"
                          aria-hidden>{SECTOR_ICON[r.sector]}</span>
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-forest-800/75">{sectorLabel(r.sector, lang)}</td>
                    <td className="px-3 py-2.5 text-forest-800/75">{r.village}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-base font-extrabold tabular-nums" style={{ color: BAND_COLOR[r.band as Band] }}>
                        {Math.round(r.score)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><RowSpark id={r.id} band={r.band as Band} /></td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="chip !py-0.5 !px-2 !text-[10.5px]"
                          style={{ background: `${BAND_COLOR[r.band as Band]}1c`, color: BAND_COLOR[r.band as Band] }}>
                          {BAND_LABEL[r.band as Band][lang === "hi" ? 1 : 0]}
                        </span>
                        <span className={`h-5 w-5 rounded-full text-[10.5px] font-bold flex items-center justify-center tabular-nums ${
                          r.open_alerts ? "bg-band-amber-soft text-band-amber" : "bg-cream-100 text-forest-800/40"}`}>
                          {r.open_alerts}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-forest-800/60 text-[12.5px] tabular-nums">{lastUpdated(r.id)}</td>
                    <td className="px-3 py-2.5">
                      <Link to={`/a/enterprises/${r.id}`}
                        className="press focus-ring chip border border-forest-800/15 bg-white text-forest-800 hover:bg-cream-100 !px-3">
                        {lang === "hi" ? "360° देखें" : "View 360°"} ›
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <p className="p-6 text-center text-sm text-forest-800/60">∅</p>}

          {/* pagination */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-forest-800/8 text-sm">
            <span className="text-forest-800/60 text-[12.5px]">
              {lang === "hi" ? "प्रति पृष्ठ" : "Rows per page"} <b>{PAGE_SIZE}</b>
            </span>
            <div className="flex items-center gap-1 mx-auto">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="press focus-ring h-8 w-8 rounded-lg text-forest-800/60 disabled:opacity-30">‹</button>
              {[...Array(pages)].map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`press focus-ring h-8 w-8 rounded-lg text-[13px] font-bold tabular-nums ${
                    page === i + 1 ? "bg-[#1d4ed8] text-white" : "text-forest-800/60 hover:bg-cream-100"}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                className="press focus-ring h-8 w-8 rounded-lg text-forest-800/60 disabled:opacity-30">›</button>
            </div>
            <span className="text-forest-800/60 text-[12.5px] tabular-nums">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
