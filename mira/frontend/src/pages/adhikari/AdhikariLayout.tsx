import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { OfflinePill } from "../../components/ui";
import { VillageArt, Wordmark } from "../../components/brand";
import MitraBot from "../../components/MitraBot";

const Glossary = lazy(() => import("../../components/Glossary"));

const items = [
  { to: "/a", key: "overview", icon: "📊", color: "#166534", end: true },
  { to: "/a/enterprises", key: "enterprises", icon: "🏘️", color: "#1d4ed8" },
  { to: "/a/risk", key: "riskPanel", icon: "🚨", color: "#dc2626" },
  { to: "/a/inbox", key: "inbox", icon: "📥", color: "#0f766e", badge: true },
  { to: "/a/whatif", key: "whatif", icon: "🎛️", color: "#c2410c" },
];

export default function AdhikariLayout() {
  const { t } = useTranslation();
  const { displayName, lang, setLang, logout, online } = useStore();
  const [showGuide, setShowGuide] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const poll = () =>
      apiGet("/api/messages/unread").then((u: any) => setUnread(u.total ?? 0)).catch(() => {});
    void poll();
    const iv = setInterval(poll, 20_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-dvh md:flex">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:min-h-dvh bg-white border-r border-forest-800/8
        px-4 py-5 sticky top-0 max-h-dvh overflow-y-auto">
        <Wordmark caption="" />

        <div className="mt-4 card !rounded-xl px-3 py-2.5 flex items-center gap-2.5 bg-cream-50">
          <span className="h-9 w-9 rounded-full flex items-center justify-center text-base shrink-0"
            style={{ background: "linear-gradient(135deg, #fde8d7, #f6c6a4)" }} aria-hidden>🧑‍💼</span>
          <span className="flex-1 min-w-0 leading-tight">
            <span className="block text-[13px] font-bold text-forest-800 truncate">
              {displayName.replace(/\s*\(.*\)\s*/, "") || displayName}
            </span>
            <span className="block text-[10.5px] text-forest-800/55">
              {lang === "hi" ? "फ़ील्ड अधिकारी" : "Field Officer"}
            </span>
          </span>
          <span className="text-forest-800/35 text-xs" aria-hidden>▾</span>
        </div>

        <nav className="flex flex-col gap-1.5 mt-5" aria-label="Main">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end as any}
              className={({ isActive }) =>
                `press focus-ring flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition-all ${
                  isActive ? "text-white shadow-lift" : "text-forest-800/75 hover:bg-cream-100"}`}
              style={({ isActive }) => (isActive ? { background: it.color } : undefined)}>
              {({ isActive }) => (
                <>
                  <span aria-hidden
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-base"
                    style={{ background: isActive ? "rgb(255 255 255 / 0.22)" : `${it.color}1a` }}>
                    {it.icon}
                  </span>
                  <span className="flex-1">{t(`nav.${it.key}`)}</span>
                  {(it as any).badge && unread > 0 && (
                    <span className={`h-5 min-w-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      isActive ? "bg-white/25 text-white" : "bg-band-amber-soft text-band-amber"}`}>
                      {unread}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-6 -mx-4" aria-hidden>
          <VillageArt />
        </div>

        <div className="border-t border-forest-800/8 pt-3 mt-1 space-y-0.5">
          <button onClick={() => setShowGuide(true)}
            className="press focus-ring w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-forest-800/75 hover:bg-cream-100">
            <span className="h-7 w-7 rounded-lg bg-cream-100 flex items-center justify-center text-sm" aria-hidden>❓</span>
            {lang === "hi" ? "मीरा को समझें" : "Learn MIRA"}
          </button>
          <button onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="press focus-ring w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-forest-800/75 hover:bg-cream-100">
            <span className="h-7 w-7 rounded-lg bg-cream-100 flex items-center justify-center text-sm" aria-hidden>🌐</span>
            <span className="flex-1 text-left">Language</span>
            <span className="text-xs text-forest-800/55">{lang === "en" ? "English ▾" : "हिंदी ▾"}</span>
          </button>
          <button onClick={logout}
            className="press focus-ring w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-forest-800/75 bg-forest-50 hover:bg-forest-100">
            <span className="h-7 w-7 rounded-lg bg-white flex items-center justify-center text-sm" aria-hidden>↪</span>
            {t("app.logout")}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-forest-800/8
        flex items-center justify-between px-4 py-2.5">
        <Wordmark compact />
        <div className="flex items-center gap-1.5">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end as any}
              className="press focus-ring h-9 w-9 rounded-lg flex items-center justify-center text-lg"
              style={({ isActive }) => ({ background: isActive ? `${it.color}22` : "transparent" })}>
              <span aria-hidden>{it.icon}</span>
            </NavLink>
          ))}
          <button onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="chip bg-forest-100 text-forest-800 press focus-ring">{t("app.language")}</button>
          <button onClick={logout} className="chip bg-cream-200 text-forest-800 press focus-ring"
            aria-label={t("app.logout")}>⎋</button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full fade-in page-center">
        {!online && <div className="mb-3"><OfflinePill text={t("app.offline")} /></div>}
        <Outlet />
      </main>

      <MitraBot />

      {showGuide && (
        <Suspense fallback={null}>
          <Glossary onClose={() => setShowGuide(false)} />
        </Suspense>
      )}
    </div>
  );
}
