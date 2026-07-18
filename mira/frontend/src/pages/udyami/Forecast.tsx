import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { CashFlowBars, ForecastChart } from "../../components/charts";
import { ErrorState, Skeleton } from "../../components/ui";
import { Info } from "../../components/Info";
import PageHero from "../../components/PageHero";
import { openMitraBot } from "../../components/MitraBot";
import { money, monthLabel } from "../../lib/format";

export default function Forecast() {
  const { t } = useTranslation();
  const { lang } = useStore();
  const [data, setData] = useState<any>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const load = () => {
    setErr("");
    apiGet("/api/me/forecast").then(setData).catch((e) => setErr(e.message));
    Promise.all([apiGet("/api/me/summary"), apiGet("/api/market/weather")])
      .then(([s, w]: any[]) => {
        const wx = w?.[s?.enterprise?.district];
        if (wx) setTemp(Math.round(wx.tmax_today));
      })
      .catch(() => {});
  };
  useEffect(load, []);

  const todayChip = new Date().toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN",
    { day: "numeric", month: "short" });

  if (err) return <ErrorState message={err} onRetry={load} retryLabel={t("app.retry")} />;
  if (!data) return <div className="space-y-3"><Skeleton className="h-60" /><Skeleton className="h-52" /></div>;

  const good = data.forecast.filter((f: any) => f.p50 > 0);
  const tight = data.forecast.filter((f: any) => f.p50 <= 0);
  const summary =
    lang === "hi"
      ? tight.length
        ? `${tight.map((f: any) => monthLabel(f.month, "hi")).join(", ")} में पैसा कम रहेगा — अभी से ${money(Math.abs(Math.min(...tight.map((f: any) => f.p50))))} बचाकर रखें।`
        : "अगले 6 महीने ठीक दिख रहे हैं — बचत जारी रखें!"
      : tight.length
        ? `Money looks tight in ${tight.map((f: any) => monthLabel(f.month)).join(", ")} — set aside ${money(Math.abs(Math.min(...tight.map((f: any) => f.p50))))} now.`
        : "Next 6 months look healthy — keep saving!";

  return (
    <div className="space-y-4 pb-4">
      <PageHero icon="📈" title={t("forecast.title")}
        sub={lang === "hi"
          ? "मीरा आपके 30 महीनों के रिकॉर्ड से सीखकर अगले 6 महीनों की नक़दी का अनुमान देता है।"
          : "MIRA learns from your 30 months of records to predict the next 6 months of cash."}
        from="#0e7490" to="#155e75" emojis={["🌾", "📈", "☀️"]}
        right={
          <div className="flex gap-2">
            {temp != null && <span className="chip bg-white/90 text-forest-800">☀️ {temp}°C</span>}
            <span className="chip bg-white/90 text-forest-800">
              📅 {lang === "hi" ? "आज" : "Today"}, {todayChip}
            </span>
          </div>
        } />

      <div className="md:grid md:grid-cols-2 md:gap-4 space-y-4 md:space-y-0">
      <section className="card p-4">
        <h2 className="text-sm font-bold text-forest-800/70 mb-1">{t("forecast.next6")}</h2>
        <ForecastChart history={data.history} forecast={data.forecast} lang={lang} height={330} />
        <p className="mt-2 text-sm bg-cream-100 rounded-xl p-3 text-forest-800">💡 {summary}</p>
      </section>

      {/* month chips colored by predicted band */}
      <div className="flex gap-2 overflow-x-auto pb-1 md:col-span-2 md:order-last" role="list">
        {data.forecast.map((f: any) => (
          <span key={f.month} role="listitem"
            className={`chip shrink-0 tabular-nums ${f.p50 > 0 ? "bg-band-green-soft text-band-green" : "bg-band-red-soft text-band-red"}`}>
            {monthLabel(f.month, lang)} · {money(f.p50)}
          </span>
        ))}
      </div>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-forest-800/70 mb-1">{t("forecast.history")}</h2>
        <CashFlowBars history={data.history} lang={lang} height={330} />
        <div className="flex gap-4 mt-1 text-xs text-forest-800/70">
          <span className="flex items-center gap-1.5">
            <span aria-hidden style={{ background: "#15803d", width: 9, height: 9, borderRadius: 2, display: "inline-block" }} />
            {lang === "hi" ? "आमदनी" : "Income"}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden style={{ background: "#c2410c", width: 9, height: 9, borderRadius: 2, display: "inline-block" }} />
            {lang === "hi" ? "खर्च" : "Expense"}
          </span>
        </div>
      </section>

      {/* month-by-month detail table */}
      <section className="card tint-blue lift p-4">
        <h2 className="text-sm font-bold text-forest-800/70 mb-2 flex items-center gap-1.5">
          {lang === "hi" ? "महीना-दर-महीना विवरण" : "Month-by-month detail"}
          <Info text={lang === "hi"
            ? "'कम से कम' और 'ज़्यादा से ज़्यादा' अनुमान का दायरा हैं — योजना 'अनुमान' पर बनाएँ, पर 'कम से कम' के लिए तैयार रहें।"
            : "'Low' and 'High' are the edges of the likely range — plan on 'Expected', but be prepared for 'Low'."} />
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-forest-800/50">
              <th className="py-1.5 font-semibold">{lang === "hi" ? "महीना" : "Month"}</th>
              <th className="py-1.5 font-semibold text-right">{lang === "hi" ? "कम से कम" : "Low"}</th>
              <th className="py-1.5 font-semibold text-right">{t("forecast.expected")}</th>
              <th className="py-1.5 font-semibold text-right">{lang === "hi" ? "ज़्यादा से ज़्यादा" : "High"}</th>
            </tr>
          </thead>
          <tbody>
            {data.forecast.map((f: any) => (
              <tr key={f.month} className="border-t border-forest-800/5 tabular-nums">
                <td className="py-2 font-semibold text-forest-800">{monthLabel(f.month, lang)}</td>
                <td className="py-2 text-right text-forest-800/60">{money(f.p10)}</td>
                <td className={`py-2 text-right font-bold ${f.p50 >= 0 ? "text-band-green" : "text-band-red"}`}>
                  {money(f.p50)}
                </td>
                <td className="py-2 text-right text-forest-800/60">{money(f.p90)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-forest-800/50 mt-2">
          {lang === "hi"
            ? "₹ राशियाँ आपके रिकॉर्ड पर आधारित अनुमान हैं और बदल सकती हैं। 10 में से 8 बार असली कमाई इसी दायरे में रहती है।"
            : "₹ amounts are estimates based on your records and may change. 8 times out of 10, actual cash lands inside this range."}
        </p>
      </section>

      {/* what should I do? */}
      <section className="card tint-green lift p-4 flex flex-col">
        <h2 className="text-sm font-bold text-forest-800/70 mb-2">
          {lang === "hi" ? "अभी क्या करें?" : "What should I do now?"}
        </h2>
        <ul className="space-y-2.5 flex-1 stagger">
          {(tight.length > 0
            ? [
                { icon: "🐷", en: ["Set aside a little every week", `Save before ${tight.map((f: any) => monthLabel(f.month)).join(", ")} to build your buffer.`], hi: ["हर हफ़्ते थोड़ी बचत रखें", `${tight.map((f: any) => monthLabel(f.month, "hi")).join(", ")} से पहले बफ़र बनाएँ।`] },
                { icon: "🛑", en: ["Avoid big purchases or new loans", "Expenses bite hardest in the tight months — delay what can wait."], hi: ["बड़े खर्च या नया क़र्ज़ टालें", "तंग महीनों में खर्च सबसे भारी पड़ता है — जो टल सकता है टालें।"] },
                { icon: "📄", en: ["Use good months to pay EMIs early", "Strong months build your on-time streak for the bank."], hi: ["अच्छे महीनों में किस्त पहले दें", "मज़बूत महीने बैंक के लिए आपकी स्ट्रीक बनाते हैं।"] },
              ]
            : [
                { icon: "🐷", en: ["Keep the savings habit", "A little every week keeps the buffer strong."], hi: ["बचत की आदत बनाए रखें", "हर हफ़्ते थोड़ा — बफ़र मज़बूत रहता है।"] },
                { icon: "📄", en: ["Keep paying EMIs on time", "The streak is your strongest signal for banks."], hi: ["समय पर किस्त देते रहें", "स्ट्रीक बैंक के लिए सबसे मज़बूत संकेत है।"] },
                { icon: "🌱", en: ["Consider growing in strong months", "Healthy months are the time to invest in the business."], hi: ["अच्छे महीनों में बढ़ने की सोचें", "सेहतमंद महीने कारोबार बढ़ाने का समय हैं।"] },
              ]
          ).map((s, i) => {
            const [head, body] = lang === "hi" ? s.hi : s.en;
            return (
              <li key={i} className="rounded-xl bg-white/80 border border-forest-800/8 p-3 flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-band-green text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5"
                  aria-hidden>{i + 1}</span>
                <span className="text-xl shrink-0" aria-hidden>{s.icon}</span>
                <div>
                  <p className="text-sm font-bold text-forest-800">{head}</p>
                  <p className="text-xs text-forest-800/60 mt-0.5">{body}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          onClick={() => openMitraBot(lang === "hi"
            ? "मेरे पूर्वानुमान के हिसाब से मुझे क्या करना चाहिए?"
            : "Based on my forecast, what should I do?")}
          className="press focus-ring chip bg-forest-100 text-forest-800 mt-3 py-2.5 justify-center">
          🤖 {t("alerts.ask")}
        </button>
      </section>
      </div>
    </div>
  );
}
