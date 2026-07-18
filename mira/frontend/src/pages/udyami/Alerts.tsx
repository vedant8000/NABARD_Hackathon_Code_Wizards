import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { ErrorState, Skeleton } from "../../components/ui";
import { Info } from "../../components/Info";
import PageHero from "../../components/PageHero";
import { openMitraBot } from "../../components/MitraBot";
import { speak } from "../../lib/useSpeech";

/** The 11 early-warning signals MIRA continuously evaluates. */
const WATCHLIST: { code: string; icon: string; en: string; hi: string; whyEn: string; whyHi: string }[] = [
  { code: "EWS-01", icon: "🐷", en: "Savings regularity", hi: "बचत की नियमितता", whyEn: "Fires when no savings deposit is made for 2 months in a row.", whyHi: "लगातार 2 महीने बचत जमा न होने पर चेतावनी।" },
  { code: "EWS-02", icon: "🏦", en: "EMI payments", hi: "किस्त भुगतान", whyEn: "Fires when the latest loan EMI was missed.", whyHi: "पिछली किस्त छूटने पर चेतावनी।" },
  { code: "EWS-03", icon: "📉", en: "Cash flow outlook", hi: "नक़दी का रुख़", whyEn: "Fires when the forecast shows losses in 2 of the next 3 months.", whyHi: "अगले 3 में से 2 महीने घाटे का अनुमान होने पर।" },
  { code: "EWS-04", icon: "🛟", en: "Savings buffer", hi: "बचत का सहारा", whyEn: "Fires when savings are less than 1 month of expenses.", whyHi: "बचत 1 महीने के खर्च से कम होने पर।" },
  { code: "EWS-05", icon: "📱", en: "Digital activity", hi: "डिजिटल गतिविधि", whyEn: "Fires when sales activity drops over 30% below normal.", whyHi: "बिक्री गतिविधि सामान्य से 30% से ज़्यादा गिरने पर।" },
  { code: "EWS-06", icon: "🌽", en: "Input costs", hi: "लागत के दाम", whyEn: "Fires when your input prices rise over 15% in 3 months.", whyHi: "3 महीने में लागत 15% से ज़्यादा बढ़ने पर।" },
  { code: "EWS-07", icon: "🏷️", en: "Selling prices", hi: "बिक्री के दाम", whyEn: "Fires when your selling prices fall over 12% in 3 months.", whyHi: "3 महीने में बिक्री दाम 12% से ज़्यादा गिरने पर।" },
  { code: "EWS-08", icon: "🌦️", en: "Weather risk", hi: "मौसम जोखिम", whyEn: "Fires on a 40%+ rainfall deficit, or heatwaves for dairy/poultry.", whyHi: "40%+ बारिश की कमी या डेयरी/मुर्गी के लिए लू पर।" },
  { code: "EWS-09", icon: "💸", en: "Unusual expenses", hi: "असामान्य खर्च", whyEn: "Fires when a month's expense is far above your own history.", whyHi: "किसी महीने का खर्च आपके इतिहास से बहुत ज़्यादा होने पर।" },
  { code: "EWS-10", icon: "👥", en: "Buyer diversity", hi: "ख़रीदार विविधता", whyEn: "Fires when most income depends on very few buyers.", whyHi: "कमाई बहुत कम ख़रीदारों पर टिकी होने पर।" },
  { code: "EWS-99", icon: "🔍", en: "Overall pattern", hi: "समग्र पैटर्न", whyEn: "An AI model flags patterns that look unusual overall.", whyHi: "AI मॉडल असामान्य दिखने वाले पैटर्न पकड़ता है।" },
];

const wl = (code: string) => WATCHLIST.find((w) => w.code === code);

export default function Alerts() {
  const { t } = useTranslation();
  const { lang } = useStore();
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [err, setErr] = useState("");

  const load = () => {
    setErr("");
    apiGet("/api/me/alerts").then(setAlerts).catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  if (err) return <ErrorState message={err} onRetry={load} retryLabel={t("app.retry")} />;
  if (!alerts) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  const reds = visible.filter((a) => a.severity === "red").length;
  const ambers = visible.filter((a) => a.severity === "amber").length;
  const allClear = visible.length === 0;

  return (
    <div className="space-y-4 pb-4">
      {/* ── summary banner ─────────────────────────────────── */}
      <PageHero
        icon={allClear ? "🌱" : reds > 0 ? "🚨" : "⚠️"}
        title={t("alerts.title")}
        sub={allClear
          ? (lang === "hi" ? "सब ठीक है! मीरा रोज़ जाँच करता रहेगा।" : "All clear! MIRA keeps checking every day.")
          : lang === "hi"
            ? `मीरा ने ${visible.length} बात${visible.length > 1 ? "ें" : ""} पकड़ी ${visible.length > 1 ? "हैं" : "है"} — हर एक के साथ करने लायक एक काम है।`
            : `MIRA spotted ${visible.length} thing${visible.length > 1 ? "s" : ""} — each comes with one action you can take.`}
        from={allClear ? "#15803d" : reds > 0 ? "#b91c1c" : "#d97706"}
        to={allClear ? "#14532d" : reds > 0 ? "#7f1d1d" : "#92400e"}
        emojis={["🔔", "🐔", "🌾"]}
        right={!allClear ? (
          <div className="flex gap-2">
            {reds > 0 && <span className="chip bg-white/20 text-white">🔴 {reds}</span>}
            {ambers > 0 && <span className="chip bg-white/20 text-white">🟠 {ambers}</span>}
          </div>
        ) : undefined}
      />

      {/* ── alert cards ────────────────────────────────────── */}
      {!allClear && (
        <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-3 md:items-start stagger">
          {visible.map((a) => {
            const meta = wl(a.code);
            return (
              <article key={a.id} className="card lift overflow-hidden"
                style={{ borderLeft: `5px solid ${a.severity === "red" ? "#dc2626" : a.severity === "amber" ? "#d97706" : "#1d4ed8"}` }}>
                <div className="p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="text-2xl h-10 w-10 rounded-xl bg-cream-100 flex items-center justify-center shrink-0"
                      aria-hidden>{meta?.icon ?? "🔔"}</span>
                    <div className="flex-1">
                      <p className="text-[13px] font-bold text-forest-800 flex items-center gap-1.5">
                        {meta ? (lang === "hi" ? meta.hi : meta.en) : a.name}
                        {meta && <Info text={lang === "hi" ? meta.whyHi : meta.whyEn} />}
                      </p>
                      <span className={`chip !py-0.5 !px-2 !text-[10px] ${
                        a.severity === "red" ? "bg-band-red-soft text-band-red" : "bg-band-amber-soft text-band-amber"}`}>
                        {a.code} · {a.severity === "red"
                          ? (lang === "hi" ? "ज़रूरी" : "urgent")
                          : (lang === "hi" ? "ध्यान दें" : "attention")}
                      </span>
                    </div>
                    <button aria-label="Listen" className="press focus-ring text-lg opacity-70 hover:opacity-100"
                      onClick={() => speak(lang === "hi" ? `${a.message_hi} ${a.action_hi}` : `${a.message_en} ${a.action_en}`, lang)}>
                      🔊
                    </button>
                  </div>

                  <p className="font-semibold text-forest-800 text-[15px] leading-snug">
                    {lang === "hi" ? a.message_hi : a.message_en}
                  </p>
                  <div className="mt-2.5 rounded-xl bg-forest-50 border border-forest-800/8 px-3 py-2.5 text-sm text-forest-800/85">
                    <span className="font-bold text-forest-700">✦ {t("alerts.action")}: </span>
                    {lang === "hi" ? a.action_hi : a.action_en}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setDismissed((s) => new Set(s).add(a.id))}
                      className="press focus-ring chip bg-band-green text-white flex-1 justify-center py-2.5 font-bold">
                      ✓ {t("alerts.done")}
                    </button>
                    <button
                      onClick={() => openMitraBot(lang === "hi"
                        ? `इस चेतावनी का मतलब समझाएँ: ${a.message_hi}`
                        : `Explain this alert: ${a.message_en}`)}
                      className="press focus-ring chip bg-forest-100 text-forest-800 flex-1 justify-center py-2.5">
                      🤖 {t("alerts.ask")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── signal board ───────────────────────────────────── */}
      <section className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-display text-lg font-bold text-forest-800">
            {lang === "hi" ? "मीरा 11 संकेतों पर नज़र रखता है" : "MIRA watches 11 signals for you"}
          </h2>
          <span className="chip bg-forest-100 text-forest-800">
            {lang === "hi" ? "रोज़ जाँच" : "checked daily"}
          </span>
        </div>
        <p className="text-sm text-forest-800/60 mb-4">
          {lang === "hi"
            ? "आपकी एंट्री, बाज़ार भाव और मौसम से — हर संकेत पर ⓘ दबाकर जानें वह कब चेताता है।"
            : "From your entries, market prices and weather — tap ⓘ on any signal to see when it warns you."}
        </p>
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-2.5 stagger">
          {WATCHLIST.map((w) => {
            const active = visible.some((a) => a.code === w.code);
            return (
              <li key={w.code}
                className={`lift rounded-xl p-3 flex items-center gap-2.5 text-sm border transition-colors ${
                  active
                    ? "bg-band-amber-soft border-band-amber/35"
                    : "bg-white border-forest-800/7"}`}>
                <span className="h-9 w-9 rounded-full bg-cream-100 shadow-soft flex items-center justify-center text-lg shrink-0"
                  aria-hidden>{w.icon}</span>
                <div className="flex-1 leading-tight">
                  <p className="font-semibold text-forest-800 text-[13px] flex items-center gap-1">
                    {lang === "hi" ? w.hi : w.en}
                    <Info text={lang === "hi" ? w.whyHi : w.whyEn} left />
                  </p>
                  <p className={`text-[11px] font-bold ${active ? "text-band-amber" : "text-band-green"}`}>
                    {active ? (lang === "hi" ? "⚠ ध्यान दें" : "⚠ Attention") : (lang === "hi" ? "✓ ठीक है" : "✓ OK")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
