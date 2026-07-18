import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "../api/client";
import { useStore } from "../state/store";
import { LeafLogo, Wordmark } from "../components/brand";

const Glossary = lazy(() => import("../components/Glossary"));

const DEMO_META: Record<string, { icon: string; bg: string; subEn: string; subHi: string }> = {
  officer: { icon: "🧑‍💼", bg: "#fee2e2", subEn: "NABARD Field Officer", subHi: "नाबार्ड फ़ील्ड अधिकारी" },
  red: { icon: "🐔", bg: "#dcfce7", subEn: "Poultry Farming", subHi: "मुर्गी पालन" },
  amber: { icon: "🐄", bg: "#dbeafe", subEn: "Milk Dairy Business", subHi: "दुग्ध डेयरी व्यवसाय" },
  green: { icon: "🥛", bg: "#ede9fe", subEn: "Dairy & Livestock", subHi: "डेयरी और पशुधन" },
};

export default function Login() {
  const { t } = useTranslation();
  const { login, lang, setLang } = useStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState<any>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [acctQ, setAcctQ] = useState("");

  useEffect(() => {
    apiGet("/api/auth/demo-users").then(setDemo).catch(() => {});
  }, []);

  async function submit(u = username, p = password) {
    setBusy(true);
    setError("");
    try {
      const res = await apiPost("/api/auth/login", { username: u, password: p });
      login(res);
    } catch (e: any) {
      setError(e.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  const demoRows = demo
    ? [
        ...(demo.officer ?? []).map((u: any) => ({ ...u, meta: DEMO_META.officer })),
        ...((demo.enterprise ?? []).map((u: any, i: number) => ({
          ...u, meta: DEMO_META[["red", "amber", "green"][i] ?? "green"],
        }))),
      ]
    : [];

  return (
    <div className="min-h-dvh flex bg-[#f3efe4]">
      {/* ── Left: brand panel (HTML text = language-aware) over mockup scene art ── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden flex-col"
        style={{ background: "linear-gradient(180deg, #fdf9e9 0%, #f7f2d9 45%, #eef0d2 100%)" }}>
        {/* sun glow */}
        <div className="absolute pointer-events-none" aria-hidden
          style={{ right: "18%", top: "6%", width: "22rem", height: "22rem", borderRadius: "50%",
            background: "radial-gradient(circle, rgb(255 244 200 / 0.9), transparent 70%)" }} />
        {/* scene art from the design mockup (text-free crop), anchored bottom-right
            with fades so it never collides with the localized HTML text */}
        <div className="absolute right-0 bottom-0 pointer-events-none" aria-hidden
          style={{ width: "72%", height: "62%",
            maskImage: "linear-gradient(180deg, transparent 0%, black 26%)",
            WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 26%)" }}>
          <img src="/login-scene.jpg" alt=""
            className="w-full h-full object-cover object-right-bottom"
            style={{ maskImage: "linear-gradient(90deg, transparent 0%, black 32%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 32%)" }} />
        </div>

        <div className="relative z-10 p-8 xl:p-10 flex flex-col h-full">
          <Wordmark />
          <div className="mt-8 xl:mt-12 max-w-lg">
            <h1 className="font-display font-bold text-[3.4rem] xl:text-[4rem] leading-none text-forest-800">
              MIRA <span className="text-[2rem] xl:text-[2.4rem]">मीरा</span>
            </h1>
            <p className="text-[11px] font-extrabold tracking-[0.22em] text-forest-800/60 uppercase mt-2 border-b-2 border-forest-800/15 pb-3 w-fit pr-8">
              Mitra for Intelligent Rural Analytics
            </p>
            <p className="font-display text-[1.35rem] xl:text-2xl font-semibold text-forest-800 mt-4 leading-snug">
              {lang === "hi"
                ? <>गाँव के हर छोटे व्यवसाय का सच्चा मित्र — जो बढ़त की कमाई और खुशहाली दे।</>
                : <>A true friend for every rural micro-enterprise — one that shows tomorrow's cash today.</>}
            </p>

            <ul className="mt-6 space-y-3.5">
              {[
                { icon: "📈", bg: "#dcfce7", en: ["Decide with clarity", "Your income, expenses and savings — one full picture."], hi: ["समझदारी से निर्णय लें", "आय, खर्च और बचत की पूरी तस्वीर एक जगह।"] },
                { icon: "🛡️", bg: "#dbeafe", en: ["Safe & trusted", "Your data's security is our first priority."], hi: ["सुरक्षित और भरोसेमंद", "आपके डेटा की सुरक्षा हमारी प्राथमिकता।"] },
                { icon: "🔔", bg: "#fef3c7", en: ["Timely alerts & advice", "Important warnings and suggestions, right on time."], hi: ["समय पर अलर्ट और सलाह", "ज़रूरी चेतावनी और सुझाव तुरंत प्राप्त करें।"] },
                { icon: "🌱", bg: "#dcfce7", en: ["Every step towards growth", "Grow your business, become self-reliant."], hi: ["विकास की ओर हर कदम", "अपने व्यवसाय को बढ़ाएँ, आत्मनिर्भर बनें।"] },
              ].map((f) => {
                const [head, body] = lang === "hi" ? f.hi : f.en;
                return (
                  <li key={f.icon} className="flex items-center gap-3.5">
                    <span className="h-11 w-11 rounded-xl bg-white shadow-soft flex items-center justify-center text-xl shrink-0"
                      style={{ boxShadow: "0 2px 10px rgb(20 83 45 / 0.12)" }} aria-hidden>{f.icon}</span>
                    <div>
                      <p className="font-bold text-forest-800 text-[15px] leading-tight">{head}</p>
                      <p className="text-[12.5px] text-forest-800/65 leading-tight mt-0.5">{body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* stats band */}
          <div className="mt-auto relative z-10 rounded-2xl px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-white"
            style={{ background: "linear-gradient(120deg, rgb(15 61 34 / 0.94), rgb(20 83 45 / 0.94))", backdropFilter: "blur(4px)" }}>
            <div className="flex items-center gap-2.5 pr-4 border-r border-white/15">
              <span aria-hidden>🛡️</span>
              <div className="leading-tight">
                <p className="text-[12.5px] font-bold">{lang === "hi" ? "SHG, FPO और ग्रामीण उद्यमियों का भरोसा" : "Trusted by SHGs, FPOs & Rural Entrepreneurs"}</p>
                <p className="text-[10.5px] opacity-75">{lang === "hi" ? "सुरक्षित · सरल · स्मार्ट" : "Secure · Simple · Smart"}</p>
              </div>
            </div>
            {[
              { icon: "👥", v: "25K+", en: "Active Users", hi: "सक्रिय उपयोगकर्ता" },
              { icon: "🤝", v: "850+", en: "SHGs & FPOs", hi: "SHG और FPO" },
              { icon: "📍", v: "50+", en: "Districts", hi: "ज़िले" },
            ].map((s) => (
              <div key={s.v} className="flex items-center gap-2">
                <span aria-hidden>{s.icon}</span>
                <div className="leading-tight">
                  <p className="text-base font-extrabold tabular-nums">{s.v}</p>
                  <p className="text-[10.5px] opacity-75">{lang === "hi" ? s.hi : s.en}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: sign-in card ── */}
      <div className="w-full lg:w-[520px] xl:w-[560px] flex items-center justify-center p-4 md:p-8">
        <div className="card w-full max-w-md p-6 md:p-7 fade-in bg-white">
          {/* language pills */}
          <div className="flex justify-end">
            <div className="inline-flex rounded-full border border-forest-800/12 p-0.5 bg-cream-100">
              {(["en", "hi"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  className={`press focus-ring rounded-full px-3.5 py-1 text-xs font-bold transition-colors ${
                    lang === l ? "bg-forest-800 text-white" : "text-forest-800/60"}`}>
                  {l === "en" ? "English" : "हिंदी"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2">
            <span className="h-14 w-14 rounded-full bg-forest-50 border border-forest-800/8 flex items-center justify-center shadow-soft">
              <LeafLogo size={30} />
            </span>
            <div>
              <h1 className="font-display text-[1.55rem] font-bold text-forest-800 leading-tight">
                {lang === "hi" ? "मीरा में स्वागत है" : "Welcome to MIRA"}
              </h1>
              <p className="text-[13px] text-forest-800/60">
                {lang === "hi" ? "अपने खाते में लॉगिन करें" : "Sign in to your account"}
              </p>
            </div>
          </div>

          <form className="mt-5 space-y-3.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <label className="block">
              <span className="text-xs font-bold text-forest-800/70">{t("login.username")}</span>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-800/40" aria-hidden>👤</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username" required placeholder="udyami18"
                  className="focus-ring w-full rounded-xl border border-forest-800/14 bg-cream-50 pl-10 pr-3.5 py-3 text-[15px] transition-colors hover:border-forest-800/30" />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-forest-800/70">{t("login.password")}</span>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-800/40" aria-hidden>🔒</span>
                <input type={showPw ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" required placeholder="••••••••"
                  className="focus-ring w-full rounded-xl border border-forest-800/14 bg-cream-50 pl-10 pr-11 py-3 text-[15px] transition-colors hover:border-forest-800/30" />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-forest-800/45 press focus-ring rounded">
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between text-[12.5px]">
              <label className="flex items-center gap-1.5 text-forest-800/70 font-medium cursor-pointer">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                  className="accent-[#166534] h-3.5 w-3.5" />
                {lang === "hi" ? "मुझे याद रखें" : "Remember me"}
              </label>
              <span className="text-forest-800/50 font-medium">
                {lang === "hi" ? "पासवर्ड भूल गए?" : "Forgot password?"}
              </span>
            </div>

            {error && <p className="text-sm text-band-red" role="alert">⚠ {error}</p>}
            <button type="submit" disabled={busy}
              className="btn-primary focus-ring w-full py-3.5 text-[15px] disabled:opacity-60">
              {busy ? "…" : `${lang === "hi" ? "लॉगिन करें" : "Log in"}  →`}
            </button>
          </form>

          {/* demo accounts */}
          <div className="flex items-center gap-3 my-4">
            <span className="flex-1 h-px bg-forest-800/10" />
            <span className="text-[11px] font-semibold text-forest-800/50">
              {lang === "hi" ? "या एक डेमो खाता चुनें" : "Or choose a demo account"}
            </span>
            <span className="flex-1 h-px bg-forest-800/10" />
          </div>
          <div className="space-y-2 stagger">
            {demoRows.map((u: any) => (
              <button key={u.username} onClick={() => void submit(u.username, "mira2026")}
                className="press focus-ring lift card !rounded-xl w-full px-3.5 py-2.5 flex items-center gap-3 text-left bg-white">
                <span className="h-10 w-10 rounded-full flex items-center justify-center text-lg shrink-0"
                  style={{ background: u.meta.bg }} aria-hidden>{u.meta.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-forest-800 truncate">{u.display_name}</span>
                  <span className="block text-[11px] text-forest-800/55">
                    {lang === "hi" ? u.meta.subHi : u.meta.subEn}
                  </span>
                </span>
                <span className="text-forest-800/35" aria-hidden>›</span>
              </button>
            ))}
          </div>

          {/* all 64 demo accounts, searchable */}
          <button onClick={() => setShowAll((v) => !v)}
            className="press focus-ring mt-3 w-full rounded-xl border border-dashed border-forest-800/20 px-4 py-2.5 text-[13px] font-bold text-forest-700 flex items-center justify-between">
            <span>👥 {lang === "hi"
              ? `सभी ${demo?.all_enterprises?.length ?? 64} डेमो उद्यम देखें`
              : `Browse all ${demo?.all_enterprises?.length ?? 64} demo enterprises`}</span>
            <span aria-hidden>{showAll ? "⌃" : "⌄"}</span>
          </button>
          {showAll && demo?.all_enterprises && (
            <div className="mt-2 fade-in">
              <input value={acctQ} onChange={(e) => setAcctQ(e.target.value)}
                placeholder={lang === "hi" ? "नाम, गाँव या क्षेत्र खोजें…" : "Search name, village or sector…"}
                className="focus-ring w-full rounded-xl border border-forest-800/14 bg-cream-50 px-3.5 py-2.5 text-sm" />
              <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-forest-800/10 divide-y divide-forest-800/6">
                {demo.all_enterprises
                  .filter((u: any) => !acctQ ||
                    u.display_name.toLowerCase().includes(acctQ.toLowerCase()) ||
                    u.village.toLowerCase().includes(acctQ.toLowerCase()) ||
                    u.sector.toLowerCase().includes(acctQ.toLowerCase()))
                  .map((u: any) => (
                    <li key={u.username}>
                      <button onClick={() => void submit(u.username, "mira2026")}
                        className="press focus-ring w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-cream-50">
                        <span className="h-2 w-2 rounded-full shrink-0" aria-hidden
                          style={{ background: u.band === "red" ? "#dc2626" : u.band === "amber" ? "#d97706" : "#16a34a" }} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-bold text-forest-800 truncate">{u.display_name}</span>
                          <span className="block text-[10.5px] text-forest-800/50 capitalize">
                            {u.sector.replace("_", " ")} · {u.village}
                          </span>
                        </span>
                        <span className="text-[10.5px] font-bold text-forest-800/40 tabular-nums">{u.username}</span>
                        <span className="text-forest-800/30" aria-hidden>›</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <button onClick={() => setShowGuide(true)}
            className="press focus-ring mt-4 w-full rounded-xl bg-forest-50 border border-forest-800/8 px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-forest-800/75 font-medium">
              ❓ {lang === "hi" ? "नई हैं? मीरा के बारे में जानें" : "New here? Learn about MIRA"}
            </span>
            <span className="font-bold text-forest-700">
              {lang === "hi" ? "और जानें →" : "Learn more →"}
            </span>
          </button>
        </div>
      </div>

      {showGuide && (
        <Suspense fallback={null}>
          <Glossary onClose={() => setShowGuide(false)} />
        </Suspense>
      )}
    </div>
  );
}
