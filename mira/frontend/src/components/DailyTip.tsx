/** Personalized tip — chosen from the farmer's OWN situation, not a fixed
 * rotation. Priority: missed EMI > forecast deficit > low savings buffer >
 * input-price / weather / sales signals > strong-record encouragement >
 * sector fallback. Expands to explain the concrete benefit. */
import { useEffect, useState } from "react";
import { apiGet } from "../api/client";
import { useStore } from "../state/store";
import { openMitraBot } from "./MitraBot";
import { money, monthLabel } from "../lib/format";

interface Tip {
  icon: string;
  text: [string, string];   // [en, hi]
  why: [string, string];    // benefit explanation
  ask: [string, string];    // MitraBot prefill
}

const SECTOR_FALLBACK: Record<string, Tip> = {
  poultry: {
    icon: "🐔",
    text: ["Feed is ~60% of your cost — group-buying with 3–4 nearby farms cuts it by 5–8%.",
      "दाना ~60% लागत है — पास के 3–4 फ़ार्म मिलकर ख़रीदें तो 5–8% बचत।"],
    why: ["On a typical month's feed bill this saves more than a week of profit — and steadier costs mean a steadier MIRA score.",
      "एक महीने के दाने के बिल पर यह बचत हफ़्ते भर के मुनाफ़े से ज़्यादा है — और स्थिर लागत यानी स्थिर मीरा स्कोर।"],
    ask: ["How can I organise group feed buying?", "समूह में दाना ख़रीद कैसे शुरू करूँ?"],
  },
  dairy: {
    icon: "🥛",
    text: ["Milk yield drops in heat — shade and extra water can protect 10–15% of summer income.",
      "गर्मी में दूध घटता है — छाया और अतिरिक्त पानी से गर्मियों की 10–15% कमाई बचती है।"],
    why: ["Summer dips are the biggest avoidable loss in dairy — protecting yield keeps your cash-flow forecast green.",
      "गर्मी की गिरावट डेयरी की सबसे बड़ी टाली जा सकने वाली हानि है — दूध बचा तो पूर्वानुमान हरा रहता है।"],
    ask: ["How do I protect milk yield in summer?", "गर्मी में दूध की मात्रा कैसे बचाऊँ?"],
  },
  handicrafts: {
    icon: "🧺",
    text: ["Festival orders pay best — start stocking raw material 2 months before Diwali.",
      "त्योहारों के ऑर्डर सबसे अच्छे दाम देते हैं — दिवाली से 2 महीने पहले कच्चा माल जुटाएँ।"],
    why: ["Early stocking avoids the pre-festival price rush and lets you accept bigger orders with confidence.",
      "पहले से माल जुटाने पर त्योहार से पहले की महँगाई से बचते हैं और बड़े ऑर्डर ले पाते हैं।"],
    ask: ["Help me plan festival season stocking.", "त्योहार सीज़न की तैयारी की योजना बनाएँ।"],
  },
  rural_retail: {
    icon: "🛒",
    text: ["Track your 5 fastest-selling items weekly — they earn most of your profit.",
      "हर हफ़्ते 5 सबसे तेज़ बिकने वाली चीज़ें देखें — मुनाफ़ा उन्हीं से आता है।"],
    why: ["Keeping fast-movers always in stock lifts sales without any new investment — pure profit from attention.",
      "तेज़ बिकने वाली चीज़ें हमेशा स्टॉक में रहें तो बिना नए निवेश के बिक्री बढ़ती है।"],
    ask: ["How do I find my most profitable items?", "सबसे मुनाफ़े वाली चीज़ें कैसे पहचानूँ?"],
  },
  food_processing: {
    icon: "🍲",
    text: ["Lock raw-material rates with suppliers before the festival demand spike.",
      "त्योहारी माँग बढ़ने से पहले आपूर्तिकर्ताओं से कच्चे माल के दाम तय कर लें।"],
    why: ["Fixed input rates during your best sales window mean the festival margin stays with you, not the supplier.",
      "सबसे अच्छी बिक्री के समय लागत तय हो तो त्योहार का मुनाफ़ा आपके पास रहता है।"],
    ask: ["How to negotiate rates with suppliers?", "आपूर्तिकर्ताओं से दाम कैसे तय करूँ?"],
  },
};

function pickTip(sum: any, alerts: any[], fc: any): Tip {
  const codes = new Set((alerts ?? []).map((a) => a.code));
  const deficits = (fc?.forecast ?? []).filter((f: any) => f.p50 < 0);
  const worst = deficits.length
    ? deficits.reduce((w: any, f: any) => (f.p50 < w.p50 ? f : w), deficits[0])
    : null;

  // 1 — missed EMI: the record must be protected first
  if (codes.has("EWS-02")) {
    return {
      icon: "🏦",
      text: [`Your last EMI was missed — talk to your officer about a part-payment before ${sum?.next_emi_date ?? "the next due date"}.`,
        "पिछली किस्त छूटी है — अगली तारीख़ से पहले अधिकारी से आंशिक भुगतान की बात करें।"],
      why: [`On-time repayment is the single strongest thing banks check. Even a part-payment now protects the record you built${sum?.ontime_streak ? ` over ${sum.ontime_streak} months` : ""} — losing it makes future loans slower and costlier.`,
        "समय पर किस्त बैंकों के लिए सबसे बड़ा भरोसा है। अभी आंशिक भुगतान भी आपका बनाया रिकॉर्ड बचाता है — रिकॉर्ड टूटा तो आगे क़र्ज़ धीमा और महँगा मिलेगा।"],
      ask: ["My EMI was missed. What exactly should I tell my officer?", "मेरी किस्त छूट गई। अधिकारी से क्या कहूँ?"],
    };
  }

  // 2 — a deficit month is coming: save ahead of it
  if (worst && sum) {
    const gap = Math.abs(Math.round(worst.p50));
    const weekly = Math.max(50, Math.ceil(gap / 8 / 50) * 50);
    return {
      icon: "🐷",
      text: [`MIRA expects money to be tight in ${monthLabel(worst.month)} (${money(worst.p50)}). Start saving ~${money(weekly)} a week from today.`,
        `${monthLabel(worst.month, "hi")} में पैसा कम रहने का अनुमान है (${money(worst.p50)})। आज से हर हफ़्ते ~${money(weekly)} बचाना शुरू करें।`],
      why: [`Saving ${money(weekly)} weekly builds ~${money(weekly * 8)} before the tight month arrives — covering the gap without borrowing at high interest, and keeping your EMI of ${money(sum.emi_amount)} safely on time.`,
        `हर हफ़्ते ${money(weekly)} की बचत तंग महीने से पहले ~${money(weekly * 8)} जोड़ देगी — महँगे उधार के बिना घाटा पूरा होगा और ${money(sum.emi_amount)} की किस्त समय पर रहेगी।`],
      ask: [`How should I prepare for the tight month of ${monthLabel(worst.month)}?`, `${monthLabel(worst.month, "hi")} के तंग महीने की तैयारी कैसे करूँ?`],
    };
  }

  // 3 — savings buffer below one month of expenses
  if (codes.has("EWS-04") && sum) {
    return {
      icon: "🛟",
      text: [`Your savings (${money(sum.savings_balance)}) are below one month of expenses — set aside a fixed cut from every sale.`,
        `आपकी बचत (${money(sum.savings_balance)}) एक महीने के खर्च से कम है — हर बिक्री से तय हिस्सा अलग रखें।`],
      why: ["A one-month buffer means one bad week never becomes a missed EMI. It also lifts the cash-flow part of your MIRA score — the component banks weigh heaviest.",
        "एक महीने का बफ़र हो तो एक बुरा हफ़्ता कभी छूटी किस्त नहीं बनता। इससे मीरा स्कोर का नक़दी हिस्सा भी बढ़ता है — जिसे बैंक सबसे ज़्यादा देखते हैं।"],
      ask: ["Make me a simple weekly savings plan.", "मेरे लिए आसान साप्ताहिक बचत योजना बनाएँ।"],
    };
  }

  // 4 — input costs rising
  if (codes.has("EWS-06")) {
    return {
      icon: "🌽",
      text: ["Your input prices are rising sharply — bulk-buy with your group or FPO now to lock today's rate.",
        "आपकी लागत तेज़ी से बढ़ रही है — समूह/FPO के साथ अभी थोक ख़रीद कर आज का दाम तय करें।"],
      why: ["Buying before the next rise protects your margin for weeks. Group volumes also earn a discount an individual buyer never gets.",
        "अगली बढ़त से पहले ख़रीदा तो हफ़्तों का मार्जिन बचेगा। समूह की मात्रा पर वह छूट भी मिलती है जो अकेले नहीं मिलती।"],
      ask: ["Input prices are rising. How do I protect my margin?", "लागत बढ़ रही है। मुनाफ़ा कैसे बचाऊँ?"],
    };
  }

  // 5 — weather risk
  if (codes.has("EWS-08")) {
    return {
      icon: "🌦️",
      text: ["Weather risk is high in your area — protect animals and stock, plan water use, and avoid new loans this month.",
        "आपके इलाक़े में मौसम जोखिम है — पशु/माल बचाएँ, पानी की योजना बनाएँ, इस महीने नया क़र्ज़ न लें।"],
      why: ["Acting before the weather hits keeps income steady — most climate losses come from being unprepared, not from the weather itself.",
        "मौसम आने से पहले तैयारी करने पर कमाई स्थिर रहती है — ज़्यादातर नुक़सान मौसम से नहीं, बिना तैयारी से होता है।"],
      ask: ["What should I do to prepare for the weather risk?", "मौसम जोखिम की तैयारी में क्या करूँ?"],
    };
  }

  // 6 — sales slowdown
  if (codes.has("EWS-05")) {
    return {
      icon: "📱",
      text: ["Your sales activity has slowed — call your 3 most regular buyers this week and consider a small offer.",
        "आपकी बिक्री धीमी हुई है — इस हफ़्ते अपने 3 नियमित ख़रीदारों से बात करें, छोटा ऑफ़र आज़माएँ।"],
      why: ["A slowdown caught in week one is easy to reverse; caught in month three it is a cash-flow crisis. Early contact keeps buyers before a competitor gets them.",
        "पहले हफ़्ते में पकड़ी सुस्ती आसानी से सुधरती है; तीसरे महीने में वही नक़दी संकट बन जाती है। जल्दी संपर्क से ख़रीदार आपके पास रहते हैं।"],
      ask: ["My sales are slowing. Give me 3 concrete steps.", "बिक्री धीमी है। 3 ठोस क़दम बताएँ।"],
    };
  }

  // 7 — strong record: encourage growth
  if (sum && sum.score >= 70 && sum.ontime_streak >= 6) {
    return {
      icon: "🌟",
      text: [`Excellent record — ${sum.ontime_streak} on-time months and a healthy score of ${Math.round(sum.score)}. You may qualify for a larger credit line.`,
        `शानदार रिकॉर्ड — ${sum.ontime_streak} महीने समय पर और ${Math.round(sum.score)} का सेहतमंद स्कोर। आप बड़े क़र्ज़ के पात्र हो सकते हैं।`],
      why: ["A strong MIRA record is bargaining power: banks offer better rates and faster approval to proven repayers. Download your Credit Passport and ask about growth credit.",
        "मज़बूत मीरा रिकॉर्ड आपकी ताक़त है: सिद्ध चुकाने वालों को बैंक बेहतर दर और जल्दी मंज़ूरी देते हैं। क्रेडिट पासपोर्ट डाउनलोड कर विकास-क़र्ज़ के बारे में पूछें।"],
      ask: ["My record is good. How do I get a bigger loan for growth?", "मेरा रिकॉर्ड अच्छा है। विकास के लिए बड़ा क़र्ज़ कैसे मिलेगा?"],
    };
  }

  // 8 — sector fallback
  return SECTOR_FALLBACK[sum?.enterprise?.sector] ?? SECTOR_FALLBACK.rural_retail;
}

export default function DailyTip() {
  const { lang } = useStore();
  const [tip, setTip] = useState<Tip | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void Promise.allSettled([
      apiGet("/api/me/summary"), apiGet("/api/me/alerts"), apiGet("/api/me/forecast"),
    ]).then(([s, a, f]) => {
      const sum = s.status === "fulfilled" ? s.value : null;
      const alerts = a.status === "fulfilled" ? a.value : [];
      const fc = f.status === "fulfilled" ? f.value : null;
      setTip(pickTip(sum, alerts, fc));
    });
  }, []);

  if (!tip) return null;
  const li = lang === "hi" ? 1 : 0;

  return (
    <section className="card tint-gold lift overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="press focus-ring w-full p-4 flex items-center gap-3.5 text-left">
        <span className="medallion bg-band-amber/15 float-a" aria-hidden>{tip.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="overline !text-band-amber">{lang === "hi" ? "आज आपके लिए सलाह" : "Today's tip for you"}</p>
          <p className="text-sm text-forest-800/90 font-medium leading-snug mt-0.5">{tip.text[li]}</p>
        </div>
        <span className={`text-forest-800/40 text-lg transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden>›</span>
      </button>

      {open && (
        <div className="px-4 pb-4 fade-in">
          <div className="rounded-xl bg-white/75 border border-band-amber/20 p-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-band-amber mb-1">
              💡 {lang === "hi" ? "इससे आपको क्या फ़ायदा" : "Why this helps you"}
            </p>
            <p className="text-[13px] text-forest-800/85 leading-relaxed">{tip.why[li]}</p>
            <button
              onClick={(e) => { e.stopPropagation(); openMitraBot(tip.ask[li]); }}
              className="press focus-ring chip bg-forest-100 text-forest-800 mt-3">
              🤖 {lang === "hi" ? "मित्रबॉट से विस्तार से पूछें" : "Ask MitraBot for details"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
