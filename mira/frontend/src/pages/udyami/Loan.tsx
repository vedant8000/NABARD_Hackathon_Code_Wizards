import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { ErrorState, Skeleton, StatTile } from "../../components/ui";
import { Info } from "../../components/Info";
import PageHero from "../../components/PageHero";
import { dateLabel, money, monthLabel } from "../../lib/format";

export default function Loan() {
  const { t } = useTranslation();
  const { lang, enterpriseId, token } = useStore();
  const [sum, setSum] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [err, setErr] = useState("");

  const load = () => {
    setErr("");
    apiGet("/api/me/summary").then(setSum).catch((e) => setErr(e.message));
    apiGet("/api/me/alerts").then(setAlerts).catch(() => {});
  };
  useEffect(load, []);

  if (err) return <ErrorState message={err} onRetry={load} retryLabel={t("app.retry")} />;
  if (!sum) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-52" /></div>;

  async function downloadPassport() {
    const r = await fetch(`/api/reports/${enterpriseId}/credit-passport`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MIRA_credit_passport_${enterpriseId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 pb-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 md:items-start">
      <div className="md:col-span-2">
        <PageHero icon="🏦" title={t("loan.title")}
          sub={lang === "hi"
            ? "समय पर किस्त + नियमित बचत = बैंक का भरोसा। आपकी प्रगति नीचे है।"
            : "On-time EMIs + regular savings = a bank's trust. Your progress is below."}
          from="#6d28d9" to="#4c1d95" emojis={["📜", "🪙", "🏦"]} />
      </div>

      {sum.outstanding <= 0 && sum.emi_amount > 0 && (
        <div className="md:col-span-2 card tint-green lift p-4 flex items-center gap-3">
          <span className="text-3xl" aria-hidden>🎉</span>
          <div>
            <p className="font-display text-lg font-bold text-band-green">
              {lang === "hi" ? "बधाई हो! क़र्ज़ पूरी तरह चुका दिया गया है।" : "Congratulations! Your loan is fully repaid."}
            </p>
            <p className="text-[12.5px] text-forest-800/65">
              {lang === "hi"
                ? "यह आपके क्रेडिट पासपोर्ट में दर्ज हो गया है — अगले क़र्ज़ के लिए यह सबसे मज़बूत सबूत है।"
                : "This is now recorded in your Credit Passport — the strongest proof for your next loan."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-4 stagger">
        <StatTile icon="💳" tint={sum.outstanding <= 0 ? "green" : "rose"} label={t("loan.outstanding")}
          value={money(sum.outstanding)}
          sub={sum.outstanding <= 0 ? (lang === "hi" ? "🎉 पूरा चुकाया!" : "🎉 Fully repaid!") : undefined} />
        <StatTile icon="🗓️" tint="gold" label={t("loan.emi")} value={money(sum.emi_amount)}
          sub={
            sum.outstanding > 0 && sum.emi_original > sum.emi_amount
              ? (lang === "hi"
                ? `⬇ पूर्व-भुगतान से ${money(sum.emi_original)} से घटी`
                : `⬇ reduced from ${money(sum.emi_original)} after prepayment`)
              : sum.next_emi_date
                ? `${t("loan.nextDue")}: ${dateLabel(sum.next_emi_date, lang)}`
                : (lang === "hi" ? "कोई किस्त बाक़ी नहीं" : "No EMI due")} />
        <StatTile icon="🔥" tint="green" label={t("loan.history")}
          value={<span className="text-band-green">{sum.ontime_streak}</span>}
          sub={t("home.streak", { n: sum.ontime_streak })} />
        <StatTile icon="🐷" tint="blue" label={t("home.savings")} value={money(sum.savings_balance)} />
      </div>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-forest-800/70 mb-2">{t("loan.history")}</h2>
        <ul className="grid grid-cols-6 lg:grid-cols-12 gap-1.5" aria-label={t("loan.history")}>
          {sum.schedule?.map((m: any) => (
            <li key={m.month} className="flex flex-col items-center gap-1">
              <span
                className={`h-9 w-full rounded-lg flex items-center justify-center text-sm font-bold border ${
                  m.paid ? "bg-band-green-soft text-band-green border-band-green/25" : "bg-band-red-soft text-band-red border-band-red/25"}`}
                title={`${monthLabel(m.month, lang)}: ${m.paid ? t("loan.paid") : t("loan.missed")} ${m.amount ? money(m.amount) : ""}`}>
                {m.paid ? "✓" : "✕"}
              </span>
              <span className="text-[9px] text-forest-800/50">{monthLabel(m.month, lang)}</span>
            </li>
          ))}
        </ul>
        {sum.ontime_streak >= 3 && (
          <p className="mt-3 text-sm font-semibold text-forest-800 flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-band-green text-white flex items-center justify-center text-xs" aria-hidden>✓</span>
            {lang === "hi"
              ? <>शाबाश! आपने लगातार <b>{sum.ontime_streak}</b> किस्तें समय पर दी हैं।</>
              : <>Excellent! You've made <b>{sum.ontime_streak}</b> on-time payments in a row.</>}
          </p>
        )}
      </section>

      <section className="card p-5 text-white"
        style={{ background: "linear-gradient(135deg, #14532d, #0f3d22)" }}>
        <h2 className="font-display text-lg font-bold">📜 {t("loan.passport")}</h2>
        <p className="text-sm opacity-85 mt-1">{t("loan.passportHint")}</p>
        <button onClick={() => void downloadPassport()}
          className="press focus-ring mt-3 rounded-xl bg-white text-forest-800 font-bold px-4 py-2.5">
          ⬇ {t("loan.download")}
        </button>
        {/* how it works */}
        <ol className="mt-4 pt-3 border-t border-white/15 space-y-1.5 text-[13px] opacity-90">
          <li>1️⃣ {lang === "hi" ? "रोज़ एंट्री करें — रिकॉर्ड बनता है" : "Record daily — your track record builds"}</li>
          <li>2️⃣ {lang === "hi" ? "समय पर किस्त — स्कोर बढ़ता है" : "Pay EMIs on time — your score grows"}</li>
          <li>3️⃣ {lang === "hi" ? "पासपोर्ट डाउनलोड कर बैंक को दिखाएँ" : "Download the passport and show any bank"}</li>
        </ol>
      </section>

      {/* credit readiness checklist */}
      <section className="card p-4 md:col-span-2">
        <h2 className="text-sm font-bold text-forest-800/70 mb-3 flex items-center gap-1.5">
          {lang === "hi" ? "क़र्ज़ के लिए तैयारी" : "Credit readiness"}
          <Info text={lang === "hi"
            ? "बैंक क़र्ज़ देते समय यही 4 बातें देखते हैं। चारों ✅ हों तो क्रेडिट पासपोर्ट सबसे मज़बूत बनता है।"
            : "These are the 4 things banks look at. With all 4 checked, your Credit Passport is at its strongest."} />
        </h2>
        <ul className="grid md:grid-cols-2 gap-2">
          {[
            {
              ok: sum.score >= 70, icon: "📊",
              en: `MIRA score 70+ (yours: ${Math.round(sum.score)})`,
              hi: `मीरा स्कोर 70+ (आपका: ${Math.round(sum.score)})`,
              tipEn: "Ask MitraBot how to raise it.", tipHi: "मित्रबॉट से पूछें कैसे बढ़ाएँ।",
              okEn: "Great — banks love this.", okHi: "बहुत बढ़िया — बैंक इसे पसंद करते हैं।",
            },
            {
              ok: sum.ontime_streak >= 6, icon: "📅",
              en: `6+ months on-time EMIs (yours: ${sum.ontime_streak})`,
              hi: `6+ महीने समय पर किस्त (आपकी: ${sum.ontime_streak})`,
              tipEn: "Keep the streak going.", tipHi: "स्ट्रीक जारी रखें।",
              okEn: "You're building a strong record.", okHi: "आप मज़बूत रिकॉर्ड बना रहे हैं।",
            },
            {
              ok: sum.savings_balance > 0, icon: "🐷",
              en: `Active savings (${money(sum.savings_balance)})`,
              hi: `सक्रिय बचत (${money(sum.savings_balance)})`,
              tipEn: "Deposit weekly, even small amounts.", tipHi: "हर हफ़्ते थोड़ी बचत करें।",
              okEn: "Great! Keep your savings steady.", okHi: "बढ़िया! बचत जारी रखें।",
            },
            {
              ok: alerts.length === 0, icon: "🔔", link: alerts.length > 0,
              en: alerts.length === 0 ? "No open alerts" : `${alerts.length} open alert(s)`,
              hi: alerts.length === 0 ? "कोई चेतावनी नहीं" : `${alerts.length} खुली चेतावनी`,
              tipEn: "Act on alerts to clear them.", tipHi: "चेतावनी पर काम कर उन्हें हटाएँ।",
              okEn: "All clear.", okHi: "सब ठीक।",
            },
          ].map((c: any, i) => {
            const inner = (
              <>
                <span className={`h-7 w-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                  c.ok ? "bg-band-green text-white" : "bg-violet-100 text-violet-700"}`} aria-hidden>
                  {c.ok ? "✓" : "!"}
                </span>
                <span className="h-9 w-9 rounded-full bg-white shadow-soft flex items-center justify-center text-lg shrink-0"
                  aria-hidden>{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-forest-800">{lang === "hi" ? c.hi : c.en}</p>
                  <p className="text-xs text-forest-800/55 mt-0.5">
                    {c.ok ? (lang === "hi" ? c.okHi : c.okEn) : (lang === "hi" ? c.tipHi : c.tipEn)}
                  </p>
                </div>
                {c.link && <span className="text-forest-800/35" aria-hidden>›</span>}
              </>
            );
            const cls = `rounded-xl p-3 flex items-center gap-2.5 border w-full text-left ${
              c.ok ? "bg-band-green-soft/50 border-band-green/20" : "tint-violet"}`;
            return c.link ? (
              <li key={i}>
                <Link to="/u/alerts" className={`${cls} press focus-ring lift`}>{inner}</Link>
              </li>
            ) : (
              <li key={i} className={cls}>{inner}</li>
            );
          })}
        </ul>
        <p className="text-[11px] text-forest-800/45 mt-3">
          {lang === "hi"
            ? "यह जानकारी निर्णय-सहायता है — अंतिम मंज़ूरी बैंक की होती है।"
            : "This is decision-support — the final loan decision always rests with the bank."}
        </p>
      </section>
    </div>
  );
}
