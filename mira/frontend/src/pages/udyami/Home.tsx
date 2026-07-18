import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { BandBadge, ErrorState, ScoreGauge, Skeleton } from "../../components/ui";
import { Info } from "../../components/Info";
import DailyTip from "../../components/DailyTip";
import { openMitraBot } from "../../components/MitraBot";
import { ForecastChart, PriceSparkline } from "../../components/charts";
import { VillageArt } from "../../components/brand";
import {
  COMMODITY_UNIT, SECTOR_COMMODITIES, commodityLabel, dateLabel, money, monthLabel, type Band,
} from "../../lib/format";
import { speak } from "../../lib/useSpeech";

export default function Home() {
  const { t } = useTranslation();
  const { lang, displayName } = useStore();
  const [sum, setSum] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [fc, setFc] = useState<any>(null);
  const [prices, setPrices] = useState<any>(null);
  const [weather, setWeather] = useState<any>(null);
  const [err, setErr] = useState("");

  const load = () => {
    setErr("");
    apiGet("/api/me/summary").then(setSum).catch((e) => setErr(e.message));
    apiGet("/api/me/alerts").then(setAlerts).catch(() => setAlerts([]));
    apiGet("/api/me/forecast").then(setFc).catch(() => {});
    apiGet("/api/market/prices?days=120").then(setPrices).catch(() => {});
    apiGet("/api/market/weather").then(setWeather).catch(() => {});
  };
  useEffect(load, []);

  if (err) return <ErrorState message={err} onRetry={load} retryLabel={t("app.retry")} />;
  if (!sum) {
    return (
      <div className="md:grid md:grid-cols-3 md:gap-4 space-y-3 md:space-y-0">
        <Skeleton className="h-56 md:col-span-2" />
        <Skeleton className="h-56" />
        <Skeleton className="h-72 md:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const band = sum.band as Band;
  const reason = sum.drivers?.[0];
  const reasonLabel = reason ? (lang === "hi" ? reason.label_hi : reason.label_en) : null;
  const reasonLine = reason
    ? lang === "hi"
      ? `${reasonLabel} ${reason.direction === "up" ? "ज़्यादा है" : "कमज़ोर है"}`
      : `${reasonLabel} is ${reason.direction === "up" ? "high" : "weak"}`
    : null;
  const coms = SECTOR_COMMODITIES[sum.enterprise.sector];
  const wx = weather?.[sum.enterprise.district];
  const firstName = displayName || sum.enterprise.name;

  return (
    <div className="space-y-4 pb-4">
      {/* ── greeting header ── */}
      <div className="relative flex flex-wrap items-center gap-3 justify-between">
        <div className="absolute right-40 -top-6 w-56 opacity-60 pointer-events-none hidden xl:block" aria-hidden>
          <VillageArt />
        </div>
        <div>
          <h1 className="font-display text-2xl md:text-[1.8rem] font-bold text-forest-800">
            {lang === "hi" ? `नमस्ते! ${firstName} 👋` : `Namaste! ${firstName} 👋`}
          </h1>
          <p className="text-sm text-forest-800/60 mt-0.5">
            {lang === "hi" ? "आज आपका कारोबार ऐसा चल रहा है।" : "Here's how your business is performing today."}
          </p>
        </div>
        <Link to="/u/add" className="btn-primary focus-ring px-5 py-3 text-[15px] flex items-center gap-2 relative">
          <span aria-hidden>＋</span> {t("home.addToday")}
        </Link>
      </div>

      <div className="md:grid md:grid-cols-3 md:gap-4 space-y-4 md:space-y-0 md:items-start">
        {/* ── left column (2/3) ── */}
        <div className="md:col-span-2 space-y-4">
          {/* score card */}
          <section className="card p-5"
            style={{
              background: `linear-gradient(120deg, #ffffff 45%, ${
                band === "red" ? "#fdeceb" : band === "amber" ? "#fdf3e0" : "#eaf7ee"})`,
            }}>
            <div className="flex flex-wrap items-center gap-5">
              <div className="text-center">
                <p className="overline mb-1 flex items-center gap-1 justify-center">
                  {t("home.score")}
                  <Info text={lang === "hi"
                    ? "0–100 की सेहत-रिपोर्ट: आपकी एंट्री, बाज़ार भाव और मौसम से। 70+ हरा, 45–69 नारंगी, <45 लाल।"
                    : "A 0–100 health report from your entries, market prices and weather. 70+ Green, 45–69 Amber, below 45 Red."} />
                </p>
                <ScoreGauge score={sum.score} band={band} size={140} />
              </div>

              <div className="flex-1 min-w-56 space-y-2">
                <BandBadge band={band} lang={lang} />
                {reasonLine && (
                  <h2 className="font-display text-xl font-bold text-forest-800 leading-snug">{reasonLine}</h2>
                )}
                <p className="text-[13px] text-forest-800/60">
                  {lang === "hi"
                    ? "एंट्री करते रहें और सुझावों पर चलें — स्कोर सुधरेगा।"
                    : "Keep tracking your entries and follow suggestions to improve your score."}
                </p>
                <button onClick={() => openMitraBot(lang === "hi" ? "मेरा स्कोर क्यों कम है?" : "Why is my score what it is?")}
                  className="press focus-ring text-sm font-bold text-forest-700 underline decoration-dotted">
                  💬 {lang === "hi" ? "क्यों? मित्रबॉट से पूछें" : "Why? Ask MitraBot"} ↗
                </button>
              </div>

              {/* right mini-facts */}
              <div className="w-full lg:w-56 space-y-2">
                <div className="rounded-xl bg-white/85 border border-forest-800/8 px-3 py-2.5 flex items-center gap-2.5 text-sm">
                  <span aria-hidden>💰</span>
                  <span className="flex-1 text-forest-800/65">{t("home.savings")}</span>
                  <b className="tabular-nums text-forest-800">{money(sum.savings_balance)}</b>
                </div>
                {sum.emi_amount > 0 && sum.next_emi_date && (
                  <div className="rounded-xl bg-white/85 border border-forest-800/8 px-3 py-2.5 flex items-center gap-2.5 text-sm">
                    <span aria-hidden>📅</span>
                    <span className="flex-1 text-forest-800/65">{t("home.nextEmi")}</span>
                    <b className="tabular-nums text-forest-800">{money(sum.emi_amount)}</b>
                    <span className="text-[11px] text-terra-600 font-bold">{dateLabel(sum.next_emi_date, lang)}</span>
                  </div>
                )}
                {sum.emi_amount > 0 && sum.outstanding <= 0 && (
                  <div className="rounded-xl bg-band-green-soft border border-band-green/20 px-3 py-2.5 flex items-center gap-2.5 text-sm">
                    <span aria-hidden>🎉</span>
                    <b className="text-band-green">{lang === "hi" ? "क़र्ज़ पूरा चुकाया!" : "Loan fully repaid!"}</b>
                  </div>
                )}
                {sum.ontime_streak > 0 && (
                  <div className="rounded-xl bg-band-green-soft border border-band-green/20 px-3 py-2.5 flex items-center gap-2.5 text-sm">
                    <span aria-hidden>✅</span>
                    <b className="text-band-green">{t("home.streak", { n: sum.ontime_streak })}</b>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* forecast preview */}
          {fc && (
            <section className="card p-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-forest-800/70 flex items-center gap-1.5">
                  {t("forecast.next6")}
                  <Info text={lang === "hi"
                    ? "बिंदुदार रेखा = अनुमान। हरा घेरा = संभावित दायरा (10 में से 8 बार असली नक़दी इसी में)।"
                    : "Dotted line = forecast. Shaded band = likely range (real cash lands inside 8 times out of 10)."} />
                </h2>
                <Link to="/u/forecast" className="text-xs font-bold text-forest-700 focus-ring rounded flex items-center gap-1">
                  {t("forecast.title")} <span aria-hidden>→</span>
                </Link>
              </div>
              <ForecastChart history={fc.history} forecast={fc.forecast} lang={lang} height={225} />
              <div className="flex gap-2 overflow-x-auto pt-2">
                {fc.forecast.map((f: any) => (
                  <span key={f.month}
                    className={`chip shrink-0 tabular-nums ${f.p50 > 0 ? "bg-band-green-soft text-band-green" : "bg-band-red-soft text-band-red"}`}>
                    {monthLabel(f.month, lang)} · {money(f.p50)}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── right column ── */}
        <div className="space-y-4">
          {/* alerts panel */}
          <section className="card p-4" aria-label={t("home.activeAlerts")}>
            <div className="flex items-center gap-2 mb-2.5">
              <h2 className="text-sm font-bold text-forest-800">{t("home.activeAlerts")}</h2>
              {alerts && alerts.length > 0 && (
                <span className="chip bg-band-amber-soft text-band-amber !py-0.5 !px-2 !text-[10px]">
                  {alerts.length} {lang === "hi" ? "नई" : "new"}
                </span>
              )}
              <Link to="/u/alerts" className="ml-auto text-xs font-bold text-forest-700 focus-ring rounded">
                {lang === "hi" ? "सभी देखें" : "View all"}
              </Link>
            </div>
            {alerts == null ? (
              <Skeleton className="h-20" />
            ) : alerts.length === 0 ? (
              <p className="text-sm text-forest-800/70">🌱 {t("home.noAlerts")}</p>
            ) : (
              <ul className="space-y-3">
                {alerts.slice(0, 2).map((a, idx) => (
                  <li key={a.id} className="border-b border-forest-800/6 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: a.severity === "red" ? "#dc2626" : "#f59e0b" }} aria-hidden />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-forest-800 leading-snug">
                          {lang === "hi" ? a.message_hi : a.message_en}
                        </p>
                        <p className="text-xs mt-1 text-forest-800/60 leading-snug">
                          {lang === "hi" ? a.action_hi : a.action_en}
                        </p>
                        <Link to="/u/alerts"
                          className="inline-block mt-1.5 text-xs font-bold text-forest-700 focus-ring rounded">
                          {idx === 0
                            ? (lang === "hi" ? "कार्रवाई करें →" : "Take action →")
                            : (lang === "hi" ? "सुझाव देखें →" : "See suggestions →")}
                        </Link>
                      </div>
                      <button aria-label="Listen" className="press focus-ring text-base opacity-60 hover:opacity-100"
                        onClick={() => speak(lang === "hi" ? `${a.message_hi} ${a.action_hi}` : `${a.message_en} ${a.action_en}`, lang)}>
                        🔊
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* market prices */}
          {prices && coms && (
            <section className="card tint-gold lift p-4">
              <h2 className="text-sm font-bold text-forest-800/70 mb-2 flex items-center gap-1.5">
                📊 {lang === "hi" ? "बाज़ार भाव" : "Market prices"}
                <Info text={lang === "hi"
                  ? "जो आप बेचते हैं और जो ख़रीदते हैं — लाल ▲ मतलब आपकी लागत बढ़ रही है।"
                  : "What you sell and what you buy — red ▲ means your input cost is rising."} />
              </h2>
              {[
                { c: coms.out, hint: lang === "hi" ? "बिक्री दाम" : "you sell" },
                { c: coms.inp, hint: lang === "hi" ? "लागत" : "you buy" },
              ].map(({ c, hint }) =>
                prices[c] ? (
                  <div key={c} className="flex items-center gap-3 py-1.5 border-b border-forest-800/5 last:border-0">
                    <div className="w-24">
                      <p className="text-sm font-semibold text-forest-800">{commodityLabel(c, lang)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-forest-800/45">{hint}</p>
                    </div>
                    <div className="flex-1"><PriceSparkline series={prices[c].series} height={36} /></div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-forest-800">
                        {money(prices[c].current)}<span className="text-[10px] text-forest-800/50 font-semibold">{COMMODITY_UNIT[c] ?? ""}</span>
                      </p>
                      <p className={`text-xs font-semibold tabular-nums ${prices[c].change_30d_pct > 0 ? "text-band-red" : "text-band-green"}`}>
                        {prices[c].change_30d_pct > 0 ? "▲" : "▼"} {Math.abs(prices[c].change_30d_pct)}% / 30d
                      </p>
                    </div>
                  </div>
                ) : null,
              )}
            </section>
          )}

          {/* weather */}
          {wx && (
            <section className="card tint-blue lift p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <h2 className="text-sm font-bold text-forest-800/70">
                  🌦️ {lang === "hi" ? "मौसम" : "Weather"} · {sum.enterprise.district}
                </h2>
                <Info text={lang === "hi"
                  ? "मानसून वर्षा = जून से अब तक सामान्य के मुक़ाबले। −20% से नीचे स्कोर पर असर शुरू।"
                  : "Monsoon rain = season vs normal since June. Below −20% it starts affecting your score."} />
                <Link to="/u/forecast" className="ml-auto text-[11px] font-bold text-forest-700 focus-ring rounded">
                  {lang === "hi" ? "पूर्वानुमान →" : "View forecast →"}
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/75 p-2.5">
                  <p className="text-base" aria-hidden>☀️</p>
                  <p className="text-lg font-extrabold tabular-nums text-forest-800">{Math.round(wx.tmax_today)}°C</p>
                  <p className="text-[9.5px] uppercase tracking-wide text-forest-800/50">{lang === "hi" ? "आज अधिकतम" : "today max"}</p>
                </div>
                <div className="rounded-xl bg-white/75 p-2.5">
                  <p className="text-base" aria-hidden>🌧️</p>
                  <p className={`text-lg font-extrabold tabular-nums ${wx.monsoon_dev_pct < -20 ? "text-band-red" : "text-forest-800"}`}>
                    {wx.monsoon_dev_pct > 0 ? "+" : ""}{Math.round(wx.monsoon_dev_pct)}%
                  </p>
                  <p className="text-[9.5px] uppercase tracking-wide text-forest-800/50">{lang === "hi" ? "मानसून वर्षा" : "monsoon rain"}</p>
                </div>
                <div className="rounded-xl bg-white/75 p-2.5">
                  <p className="text-base" aria-hidden>🌡️</p>
                  <p className="text-lg font-extrabold tabular-nums text-forest-800">{wx.heat_days_30d}</p>
                  <p className="text-[9.5px] uppercase tracking-wide text-forest-800/50">{lang === "hi" ? "लू दिन/30द" : "heat days/30d"}</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <DailyTip />
    </div>
  );
}
