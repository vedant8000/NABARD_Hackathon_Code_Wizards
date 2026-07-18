/** Chart components (Recharts) — palette validated with the dataviz method:
 * series-1 green #15803d, series-2 blue #1d4ed8, series-3 terracotta #c2410c.
 * Band (status) colors are reserved for risk bands and always paired with
 * icon + label elsewhere in the UI. One axis per chart; recessive grid;
 * tooltips on every plot. */
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import { BAND_COLOR, type Band, money, moneyShort, monthLabel } from "../lib/format";

const S1 = "#15803d"; // green — income / primary series
const S2 = "#1d4ed8"; // blue — rainfall / secondary
const S3 = "#c2410c"; // terracotta — expense / tertiary
const INK = "#1c2a21";
const MUTED = "rgba(20,83,45,0.55)";

const axisProps = {
  stroke: "rgba(20,83,45,0.25)",
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false as const,
  axisLine: false as const,
};

function MoneyTooltip({ active, payload, label, lang }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs" style={{ boxShadow: "var(--shadow-lift)" }}>
      <p className="font-bold mb-1" style={{ color: INK }}>{String(label)}</p>
      {payload.filter((p: any) => p.value != null && p.name !== "_band").map((p: any) => (
        <p key={p.dataKey} className="tabular-nums flex items-center gap-1.5">
          <span aria-hidden style={{ background: p.stroke ?? p.fill, width: 8, height: 8, borderRadius: 2, display: "inline-block" }} />
          <span style={{ color: MUTED }}>{p.name}:</span>
          <span className="font-semibold" style={{ color: INK }}>{money(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** History line + P50 forecast + shaded P10–P90 band. */
export function ForecastChart({ history, forecast, lang = "en", height = 240 }: {
  history: { month: string; net: number }[];
  forecast: { month: string; p10: number; p50: number; p90: number }[];
  lang?: string; height?: number;
}) {
  const histTail = history.slice(-9);
  const data = [
    ...histTail.map((h) => ({ m: monthLabel(h.month, lang), actual: h.net })),
    ...forecast.map((f) => ({
      m: monthLabel(f.month, lang), p50: f.p50, band: [f.p10, f.p90] as [number, number],
    })),
  ];
  // join the lines at the seam
  if (histTail.length && data[histTail.length - 1]) {
    (data[histTail.length - 1] as any).p50 = histTail[histTail.length - 1].net;
  }
  const labels = lang === "hi"
    ? { actual: "अब तक", p50: "अनुमान", range: "दायरा" }
    : { actual: "Actual", p50: "Forecast", range: "Likely range" };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="m" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} tickFormatter={moneyShort} width={52} />
        <Tooltip content={<MoneyTooltip lang={lang} />} />
        <ReferenceLine y={0} stroke="rgba(20,83,45,0.3)" strokeDasharray="4 4" />
        <Area dataKey="band" name={labels.range} fill={S1} fillOpacity={0.14}
          stroke="none" isAnimationActive={false} connectNulls={false} />
        <Line dataKey="actual" name={labels.actual} stroke={S1} strokeWidth={2}
          dot={false} connectNulls={false} />
        <Line dataKey="p50" name={labels.p50} stroke={S1} strokeWidth={2}
          strokeDasharray="6 4" dot={{ r: 3, fill: S1 }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Income vs expense monthly bars (2 series, gap + legend handled by caller). */
export function CashFlowBars({ history, lang = "en", height = 220 }: {
  history: { month: string; income: number; expense: number }[];
  lang?: string; height?: number;
}) {
  const data = history.slice(-9).map((h) => ({
    m: monthLabel(h.month, lang), income: h.income, expense: h.expense,
  }));
  const labels = lang === "hi"
    ? { income: "आमदनी", expense: "खर्च" }
    : { income: "Income", expense: "Expense" };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="m" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} tickFormatter={moneyShort} width={52} />
        <Tooltip content={<MoneyTooltip lang={lang} />} cursor={{ fill: "rgba(20,83,45,0.05)" }} />
        <Bar dataKey="income" name={labels.income} fill={S1} radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="expense" name={labels.expense} fill={S3} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-series price sparkline with tooltip. */
export function PriceSparkline({ series, height = 60, color = S1 }: {
  series: { date: string; price: number }[]; height?: number; color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <Tooltip
          content={({ active, payload }: any) =>
            active && payload?.length ? (
              <div className="card px-2 py-1 text-xs tabular-nums">
                {payload[0].payload.date}: <b>{money(payload[0].value)}</b>
              </div>
            ) : null}
        />
        <Line dataKey="price" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Rainfall: actual (blue bars) vs normal (muted reference line). */
export function RainfallChart({ series, lang = "en", height = 180 }: {
  series: { date: string; rain: number; normal: number }[]; lang?: string; height?: number;
}) {
  const labels = lang === "hi" ? { rain: "बारिश", normal: "सामान्य" } : { rain: "Rainfall", normal: "Normal" };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={series} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd"
          tickFormatter={(d: string) => d.slice(5)} />
        <YAxis {...axisProps} width={34} unit="" />
        <Tooltip
          content={({ active, payload, label }: any) =>
            active && payload?.length ? (
              <div className="card px-3 py-2 text-xs tabular-nums">
                <p className="font-bold">{label}</p>
                {payload.map((p: any) => (
                  <p key={p.dataKey}>{p.name}: <b>{Number(p.value).toFixed(1)} mm</b></p>
                ))}
              </div>
            ) : null}
        />
        <Bar dataKey="rain" name={labels.rain} fill={S2} radius={[3, 3, 0, 0]} maxBarSize={14} />
        <Line dataKey="normal" name={labels.normal} stroke={MUTED} strokeWidth={1.5}
          strokeDasharray="5 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Risk band donut — status colors with explicit center + legend labels. */
export function RiskDonut({ bands, lang = "en", size = 190 }: {
  bands: { green: number; amber: number; red: number }; lang?: string; size?: number;
}) {
  const names = lang === "hi"
    ? { green: "सुरक्षित", amber: "सावधान", red: "जोखिम" }
    : { green: "Healthy", amber: "Watch", red: "At risk" };
  const data = (Object.keys(bands) as Band[]).map((b) => ({
    name: names[b], value: bands[b], band: b,
  }));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <PieChart width={size} height={size}>
        <Pie data={data} dataKey="value" innerRadius={size * 0.3} outerRadius={size * 0.44}
          paddingAngle={2} strokeWidth={2} stroke="#fff">
          {data.map((d) => <Cell key={d.band} fill={BAND_COLOR[d.band]} />)}
        </Pie>
        <Tooltip
          content={({ active, payload }: any) =>
            active && payload?.length ? (
              <div className="card px-2 py-1 text-xs">
                {payload[0].name}: <b>{payload[0].value}</b>
              </div>
            ) : null}
        />
        <text x="50%" y="48%" textAnchor="middle" fontWeight={800} fontSize={size * 0.14} fill={INK}>
          {total}
        </text>
        <text x="50%" y="60%" textAnchor="middle" fontSize={size * 0.06} fill={MUTED}>
          {lang === "hi" ? "उद्यम" : "enterprises"}
        </text>
      </PieChart>
      <ul className="text-sm space-y-1.5">
        {data.map((d) => (
          <li key={d.band} className="flex items-center gap-2 tabular-nums">
            <span aria-hidden style={{ background: BAND_COLOR[d.band], width: 10, height: 10, borderRadius: 3 }} />
            {d.name} <b>{d.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sector × band matrix as labeled count chips (not color-alone). */
export function SectorMatrix({ matrix, lang = "en" }: {
  matrix: { sector: string; green: number; amber: number; red: number }[]; lang?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide" style={{ color: MUTED }}>
            <th className="py-1 pr-2 font-semibold">{lang === "hi" ? "क्षेत्र" : "Sector"}</th>
            <th className="py-1 px-2 font-semibold">🟢</th>
            <th className="py-1 px-2 font-semibold">🟠</th>
            <th className="py-1 px-2 font-semibold">🔴</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((r) => (
            <tr key={r.sector} className="border-t border-forest-800/5">
              <td className="py-1.5 pr-2 font-medium capitalize">{r.sector.replace("_", " ")}</td>
              {(["green", "amber", "red"] as Band[]).map((b) => (
                <td key={b} className="py-1.5 px-2 tabular-nums">
                  <span className="chip"
                    style={{
                      background: r[b] ? undefined : "transparent",
                      backgroundColor: r[b] ? `${BAND_COLOR[b]}18` : "transparent",
                      color: r[b] ? BAND_COLOR[b] : MUTED,
                    }}>
                    {r[b]}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
