/** <30s entry flow: kind tile → amount keypad → category → save (offline-first). */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../api/client";
import { enqueueEntry } from "../../offline/queue";
import { useStore } from "../../state/store";
import { dateLabel, money } from "../../lib/format";
import PageHero from "../../components/PageHero";
import DailyTip from "../../components/DailyTip";

const KIND_ICON: Record<string, string> = {
  income: "🧺", expense: "🧾", savings_deposit: "🐷", loan_repayment: "🏦",
};
const KIND_BG: Record<string, string> = {
  income: "#dcfce7", expense: "#fee2e2", savings_deposit: "#dbeafe", loan_repayment: "#fef3c7",
};
const CAT_ICON: Record<string, string> = {
  milk: "🥛", eggs: "🥚", sales: "🛒", orders: "📦", feed: "🌽", stock: "📦",
  transport: "🚜", labour: "👷", group: "👥", bank: "🏦", emi: "🏦", part: "🪙", other: "🪙",
};

type Kind = "income" | "expense" | "savings_deposit" | "loan_repayment";

const KINDS: { kind: Kind; key: string; icon: string; tint: string; color: string }[] = [
  { kind: "income", key: "add.income", icon: "💰", tint: "tint-green", color: "#166534" },
  { kind: "expense", key: "add.expense", icon: "🧾", tint: "tint-rose", color: "#b91c1c" },
  { kind: "savings_deposit", key: "add.savings", icon: "🐷", tint: "tint-blue", color: "#1d4ed8" },
  { kind: "loan_repayment", key: "add.loan", icon: "🏦", tint: "tint-gold", color: "#92400e" },
];

const CATEGORIES: Record<Kind, { id: string; icon: string; en: string; hi: string }[]> = {
  income: [
    { id: "milk", icon: "🥛", en: "Milk", hi: "दूध" },
    { id: "eggs", icon: "🥚", en: "Eggs/Birds", hi: "अंडे/मुर्गी" },
    { id: "sales", icon: "🛒", en: "Sales", hi: "बिक्री" },
    { id: "orders", icon: "📦", en: "Orders", hi: "ऑर्डर" },
    { id: "other", icon: "➕", en: "Other", hi: "अन्य" },
  ],
  expense: [
    { id: "feed", icon: "🌽", en: "Feed/Fodder", hi: "चारा/दाना" },
    { id: "stock", icon: "📦", en: "Stock/Raw", hi: "माल/कच्चा" },
    { id: "transport", icon: "🚜", en: "Transport", hi: "ढुलाई" },
    { id: "labour", icon: "👷", en: "Labour", hi: "मज़दूरी" },
    { id: "other", icon: "➕", en: "Other", hi: "अन्य" },
  ],
  savings_deposit: [
    { id: "group", icon: "👥", en: "Group meeting", hi: "समूह बैठक" },
    { id: "bank", icon: "🏦", en: "Bank", hi: "बैंक" },
    { id: "other", icon: "➕", en: "Other", hi: "अन्य" },
  ],
  loan_repayment: [
    { id: "emi", icon: "🏦", en: "EMI", hi: "किस्त" },
    { id: "part", icon: "🪙", en: "Part payment", hi: "आंशिक" },
  ],
};

export default function AddEntry() {
  const { t } = useTranslation();
  const { lang, online } = useStore();
  const nav = useNavigate();
  const [kind, setKind] = useState<Kind | null>(null);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [savedOffline, setSavedOffline] = useState(false);
  const [recent, setRecent] = useState<any[] | null>(null);
  const [sum, setSum] = useState<any>(null);
  const [entryErr, setEntryErr] = useState("");

  useEffect(() => {
    apiGet("/api/me/ledger?limit=8").then(setRecent).catch(() => setRecent([]));
    apiGet("/api/me/summary").then(setSum).catch(() => {});
  }, [step === 3]);

  function press(k: string) {
    if (k === "⌫") setAmount((a) => a.slice(0, -1));
    else if (amount.length < 7) setAmount((a) => (a === "0" ? k : a + k));
  }

  /** Loan payments are checked against the linked savings balance and the
   * outstanding amount — you cannot pay with money you don't have. */
  function paymentProblem(amt: number): string | null {
    if (kind !== "loan_repayment" || !sum) return null;
    if (sum.outstanding <= 0)
      return lang === "hi" ? "क़र्ज़ पहले ही पूरा चुक चुका है — कोई किस्त बाक़ी नहीं।" : "Loan is already fully repaid — nothing is due.";
    if (amt > sum.outstanding)
      return lang === "hi"
        ? `राशि बकाया क़र्ज़ (${money(sum.outstanding)}) से ज़्यादा है।`
        : `Amount exceeds the outstanding loan (${money(sum.outstanding)}).`;
    if (amt > sum.savings_balance)
      return lang === "hi"
        ? `बचत में पर्याप्त राशि नहीं — उपलब्ध ${money(Math.max(sum.savings_balance, 0))}।`
        : `Insufficient savings balance — available ${money(Math.max(sum.savings_balance, 0))}.`;
    return null;
  }

  async function save(category: string) {
    if (!kind || !amount) return;
    const problem = paymentProblem(Number(amount));
    if (problem) {
      setEntryErr(problem);
      setStep(1);
      return;
    }
    await enqueueEntry({
      date: new Date().toISOString().slice(0, 10),
      kind, amount: Number(amount), category, note: "",
    });
    setSavedOffline(!online);
    setStep(3);
    setTimeout(() => nav("/u"), 1600);
  }

  return (
    <div className="pb-4 space-y-4">
      <PageHero icon="✍️" title={t("add.title")}
        sub={lang === "hi"
          ? "दिन के सिर्फ़ 30 सेकंड — आपका रिकॉर्ड ही आपका क्रेडिट पासपोर्ट बनता है।"
          : "Just 30 seconds a day — your records become your Credit Passport."}
        from="#b45309" to="#92400e" emojis={["🐔", "🥚", "🥛", "📔"]} />

      <div className="md:grid md:grid-cols-5 md:gap-6">
      <div className="space-y-4 md:col-span-3">

      {step === 0 && (
        <div className="grid grid-cols-2 gap-3.5 fade-in stagger">
          {KINDS.map((k) => (
            <button key={k.kind}
              onClick={() => { setKind(k.kind); setEntryErr(""); setStep(1); }}
              className={`press focus-ring card lift ${k.tint} p-6 flex flex-col items-center gap-3`}>
              <span className="h-20 w-20 rounded-full bg-white shadow-soft flex items-center justify-center text-4xl float-a"
                aria-hidden>{k.icon}</span>
              <span className="font-display text-lg font-bold" style={{ color: k.color }}>{t(k.key)}</span>
              <span className="h-8 w-8 rounded-full bg-white shadow-soft flex items-center justify-center text-sm font-bold"
                style={{ color: k.color }} aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && kind && (
        <div className="fade-in space-y-3">
          {kind === "loan_repayment" && sum && (
            <div className="rounded-xl bg-cream-100 border border-forest-800/8 px-3.5 py-2 text-[12.5px] text-forest-800/75 flex flex-wrap gap-x-4 gap-y-1 justify-center tabular-nums">
              <span>🐷 {lang === "hi" ? "उपलब्ध बचत" : "Available savings"}: <b>{money(Math.max(sum.savings_balance, 0))}</b></span>
              <span>💳 {lang === "hi" ? "बकाया क़र्ज़" : "Outstanding"}: <b>{money(sum.outstanding)}</b></span>
            </div>
          )}
          {entryErr && (
            <p className="rounded-xl bg-band-red-soft border border-band-red/25 px-3.5 py-2.5 text-[13px] font-semibold text-band-red text-center"
              role="alert">⚠ {entryErr}</p>
          )}
          <p className="text-center text-4xl font-extrabold tabular-nums text-forest-800 py-3"
            aria-live="polite">
            {amount ? money(Number(amount)) : "₹0"}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((k) => (
              <button key={k} onClick={() => press(k)}
                className="press focus-ring card py-4 text-2xl font-bold text-forest-800">
                {k}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (!amount) return;
              const problem = paymentProblem(Number(amount));
              if (problem) { setEntryErr(problem); return; }
              setEntryErr("");
              setStep(2);
            }}
            disabled={!amount}
            className="press focus-ring w-full rounded-2xl bg-forest-800 text-white text-lg font-bold py-4 disabled:opacity-40">
            →
          </button>
        </div>
      )}

      {step === 2 && kind && (
        <div className="fade-in">
          <p className="text-center text-2xl font-extrabold tabular-nums text-forest-800 pb-3">
            {money(Number(amount))}
          </p>
          <p className="text-sm font-bold text-forest-800/60 mb-2">{t("add.category")}</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES[kind].map((c) => (
              <button key={c.id} onClick={() => void save(c.id)}
                className="press focus-ring card p-4 flex flex-col items-center gap-1.5">
                <span className="text-3xl" aria-hidden>{c.icon}</span>
                <span className="text-xs font-semibold text-forest-800">{lang === "hi" ? c.hi : c.en}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="fade-in card p-10 text-center space-y-3">
          <span className="text-6xl block animate-bounce" aria-hidden>🎉</span>
          <p className="text-xl font-bold text-forest-800">{t("add.saved")}</p>
          {savedOffline && <p className="text-sm text-forest-800/60">📴 {t("add.savedOffline")}</p>}
        </div>
      )}
      </div>

      {/* Recent entries — desktop side panel */}
      <aside className="hidden md:block md:col-span-2">
        <section className="card p-4 sticky top-6">
          <h2 className="text-sm font-bold text-forest-800 mb-1.5 flex items-center justify-between">
            {lang === "hi" ? "हाल की एंट्री" : "Recent entries"}
            <span className="text-[11px] font-bold text-forest-700/70">{lang === "hi" ? "पिछले दिन" : "latest first"}</span>
          </h2>
          {recent === null ? (
            <p className="text-sm text-forest-800/50 py-4 text-center">…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-forest-800/55 py-4 text-center">∅</p>
          ) : (
            <ul className="divide-y divide-forest-800/5">
              {recent.map((r, i) => (
                <li key={i} className="flex items-center gap-2.5 py-2 text-sm">
                  <span className="h-9 w-9 rounded-full flex items-center justify-center text-base shrink-0"
                    style={{ background: KIND_BG[r.kind] ?? "#f3ede0" }} aria-hidden>
                    {CAT_ICON[r.category] ?? KIND_ICON[r.kind] ?? "•"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-forest-800 truncate">
                      {t(`add.${r.kind === "savings_deposit" ? "savings" : r.kind === "loan_repayment" ? "loan" : r.kind}`)}
                      <span className="font-medium text-forest-800/55"> – {r.category}</span>
                    </p>
                    <p className="text-[11px] text-forest-800/50">{dateLabel(r.date, lang)}</p>
                  </div>
                  <span className={`tabular-nums font-bold ${r.kind === "expense" || r.kind === "loan_repayment" ? "text-band-red" : "text-band-green"}`}>
                    {r.kind === "expense" || r.kind === "loan_repayment" ? "−" : "+"}{money(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
      </div>

      <DailyTip />
    </div>
  );
}
