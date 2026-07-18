/** "Understanding MIRA" — plain-language bilingual guide for SHG/FPO members.
 * Every concept on the website, explained simply. Opened with the ❓ button. */
import { useEffect } from "react";
import { useStore } from "../state/store";

interface Item { icon: string; en: [string, string]; hi: [string, string] }

const SECTIONS: { titleEn: string; titleHi: string; items: Item[] }[] = [
  {
    titleEn: "Your MIRA Score", titleHi: "आपका मीरा स्कोर",
    items: [
      { icon: "🎯", en: ["What is it?", "A number from 0–100 that shows how healthy your business money is — like a health report for your enterprise. It is calculated from YOUR own records, prices in the market, and weather in your area."], hi: ["यह क्या है?", "0–100 का एक नंबर जो बताता है कि आपके कारोबार के पैसों की सेहत कैसी है — जैसे कारोबार की सेहत-रिपोर्ट। यह आपकी अपनी एंट्री, बाज़ार भाव और आपके इलाक़े के मौसम से बनता है।"] },
      { icon: "🟢", en: ["Green (70+)", "Healthy — keep doing what you are doing. Banks see green as a good sign."], hi: ["हरा (70+)", "सेहतमंद — जैसा कर रहे हैं वैसा ही करते रहें। बैंक हरे को अच्छा मानते हैं।"] },
      { icon: "🟠", en: ["Amber (45–69)", "Be careful — one or two things need attention. The alerts page tells you exactly what."], hi: ["नारंगी (45–69)", "सावधान — एक-दो बातों पर ध्यान चाहिए। चेतावनी पेज बताता है क्या।"] },
      { icon: "🔴", en: ["Red (below 45)", "Risk — act now with your field officer. The earlier you act, the easier it is to recover."], hi: ["लाल (45 से कम)", "जोखिम — अधिकारी के साथ अभी काम करें। जितनी जल्दी, उतना आसान।"] },
    ],
  },
  {
    titleEn: "What makes the score (5 parts)", titleHi: "स्कोर किन 5 चीज़ों से बनता है",
    items: [
      { icon: "💧", en: ["Cash-flow health (30%)", "Is more money coming in than going out? Do you have savings to cover slow months?"], hi: ["नक़दी सेहत (30%)", "क्या खर्च से ज़्यादा कमाई है? धीमे महीनों के लिए बचत है?"] },
      { icon: "🏦", en: ["Repayment discipline (25%)", "Paying EMIs on time and saving regularly. This is the part banks trust most."], hi: ["किस्त अनुशासन (25%)", "समय पर किस्त और नियमित बचत। बैंक इसी पर सबसे ज़्यादा भरोसा करते हैं।"] },
      { icon: "📱", en: ["Digital activity (15%)", "Your sales and payments activity. A sudden slowdown is an early warning of trouble."], hi: ["डिजिटल गतिविधि (15%)", "बिक्री-भुगतान की हलचल। अचानक धीमापन मुसीबत की पहली चेतावनी है।"] },
      { icon: "🌽", en: ["Market stress (15%)", "When the cost of what you buy (feed, fodder, raw material) rises faster than what you sell for."], hi: ["बाज़ार दबाव (15%)", "जब ख़रीद (दाना, चारा, कच्चा माल) का दाम बिक्री के दाम से तेज़ बढ़े।"] },
      { icon: "🌦️", en: ["Climate exposure (15%)", "Less rain or heatwaves in your district can hurt dairy, poultry and farming income."], hi: ["जलवायु जोखिम (15%)", "कम बारिश या लू से डेयरी, मुर्गी और खेती की कमाई घट सकती है।"] },
    ],
  },
  {
    titleEn: "The forecast", titleHi: "पूर्वानुमान",
    items: [
      { icon: "📈", en: ["Next 6 months", "MIRA learns from your last 30 months and predicts money coming in minus going out, for each of the next 6 months."], hi: ["अगले 6 महीने", "मीरा आपके पिछले 30 महीनों से सीखकर अगले 6 महीनों की कमाई-खर्च का अनुमान लगाता है।"] },
      { icon: "📏", en: ["The 'likely range'", "The future is never certain, so MIRA gives a range: 8 times out of 10 your real cash flow should land inside it. The dotted line is the most likely value."], hi: ["'संभावित दायरा'", "भविष्य पक्का नहीं होता, इसलिए मीरा एक दायरा देता है: 10 में से 8 बार असली नक़दी इसी के अंदर रहेगी। बिंदुदार रेखा सबसे संभावित मान है।"] },
      { icon: "🚨", en: ["Red months", "If a month shows negative (red), start saving now — the app tells you how much to set aside."], hi: ["लाल महीने", "अगर कोई महीना लाल (घाटा) दिखे तो अभी से बचत शुरू करें — ऐप बताता है कितनी।"] },
    ],
  },
  {
    titleEn: "Alerts (early warnings)", titleHi: "चेतावनी (पहले से ख़बर)",
    items: [
      { icon: "🔔", en: ["11 signals, checked daily", "MIRA watches savings, EMIs, sales, prices, weather and more. It warns you BEFORE a problem grows — often weeks before a missed payment."], hi: ["11 संकेत, रोज़ जाँच", "मीरा बचत, किस्त, बिक्री, दाम, मौसम सब देखता है। समस्या बड़ी होने से पहले — अक्सर हफ़्तों पहले — बताता है।"] },
      { icon: "✅", en: ["Every alert has ONE action", "Not lectures — one clear thing to do. Tap 'Ask MitraBot' if you want it explained in your language."], hi: ["हर चेतावनी में एक काम", "भाषण नहीं — एक साफ़ काम। समझना हो तो 'मित्रबॉट से पूछें' दबाएँ।"] },
    ],
  },
  {
    titleEn: "Credit Passport", titleHi: "क्रेडिट पासपोर्ट",
    items: [
      { icon: "📜", en: ["Your records become power", "A one-page PDF of your score, repayment record and forecast. Show it to any bank — good records help you get loans faster and bigger."], hi: ["आपका रिकॉर्ड ही ताक़त", "स्कोर, किस्त रिकॉर्ड और पूर्वानुमान का एक पेज का PDF। किसी भी बैंक को दिखाएँ — अच्छा रिकॉर्ड जल्दी और बड़ा क़र्ज़ दिलाता है।"] },
      { icon: "🔒", en: ["Your data is yours", "Only you and your field officer see your details. The passport is downloaded by YOU, shared by YOU."], hi: ["आपका डेटा आपका है", "आपकी जानकारी सिर्फ़ आप और आपके अधिकारी देखते हैं। पासपोर्ट आप डाउनलोड करते हैं, आप ही बाँटते हैं।"] },
    ],
  },
  {
    titleEn: "How to raise your score", titleHi: "स्कोर कैसे बढ़ाएँ",
    items: [
      { icon: "1️⃣", en: ["Enter daily", "30 seconds a day. Complete records = trustworthy score."], hi: ["रोज़ एंट्री करें", "दिन के 30 सेकंड। पूरा रिकॉर्ड = भरोसेमंद स्कोर।"] },
      { icon: "2️⃣", en: ["Pay EMIs on time", "Every on-time month adds to your 🔥 streak — the strongest signal for banks."], hi: ["समय पर किस्त दें", "हर समय-पर महीना 🔥 स्ट्रीक बढ़ाता है — बैंकों के लिए सबसे मज़बूत संकेत।"] },
      { icon: "3️⃣", en: ["Save small, save weekly", "Even ₹100 a week builds your buffer and your group's record."], hi: ["छोटी, साप्ताहिक बचत", "हफ़्ते के ₹100 भी बफ़र और समूह का रिकॉर्ड बनाते हैं।"] },
      { icon: "4️⃣", en: ["Act on alerts", "Alerts caught early are cheap to fix. Ignore them and they reach your score."], hi: ["चेतावनी पर काम करें", "जल्दी पकड़ी चेतावनी सस्ते में ठीक होती है। टालने पर स्कोर तक पहुँचती है।"] },
    ],
  },
];

export default function Glossary({ onClose }: { onClose: () => void }) {
  const { lang } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
      role="dialog" aria-modal="true" aria-label="Understanding MIRA">
      <button className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Close" />
      <div className="relative card w-full max-w-3xl max-h-[88dvh] overflow-y-auto fade-in">
        <header className="sticky top-0 z-10 px-6 py-4 text-white flex items-center justify-between"
          style={{ background: "linear-gradient(120deg, #14532d, #0f3d22)" }}>
          <div>
            <h2 className="font-display text-xl font-bold">
              {lang === "hi" ? "मीरा को समझें" : "Understanding MIRA"}
            </h2>
            <p className="text-xs opacity-80">
              {lang === "hi" ? "हर चीज़, आसान भाषा में" : "Everything on this app, in simple words"}
            </p>
          </div>
          <button onClick={onClose} className="press focus-ring chip bg-white/15 text-white">✕</button>
        </header>

        <div className="p-5 md:p-6 space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.titleEn}>
              <h3 className="overline mb-2.5">{lang === "hi" ? s.titleHi : s.titleEn}</h3>
              <div className="grid md:grid-cols-2 gap-2.5">
                {s.items.map((it) => {
                  const [head, body] = lang === "hi" ? it.hi : it.en;
                  return (
                    <div key={head} className="rounded-xl bg-cream-50 border border-forest-800/6 p-3.5 flex gap-3">
                      <span className="text-xl shrink-0" aria-hidden>{it.icon}</span>
                      <div>
                        <p className="text-sm font-bold text-forest-800">{head}</p>
                        <p className="text-[13px] text-forest-800/75 leading-relaxed mt-0.5">{body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="text-[11px] text-forest-800/45 border-t border-forest-800/8 pt-3">
            {lang === "hi"
              ? "मीरा के अनुमान निर्णय में मदद के लिए हैं — क़र्ज़ का अंतिम फ़ैसला हमेशा बैंक का होता है।"
              : "MIRA's outputs help you decide — the final loan decision always rests with the bank."}
          </p>
        </div>
      </div>
    </div>
  );
}
