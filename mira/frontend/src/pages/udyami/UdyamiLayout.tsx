import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { OfflinePill } from "../../components/ui";
import { VillageArt, Wordmark } from "../../components/brand";
import MitraBot from "../../components/MitraBot";

const Glossary = lazy(() => import("../../components/Glossary"));

const tabs = [
  { to: "/u", key: "home", icon: "🏠", color: "#16a34a", end: true },
  { to: "/u/add", key: "add", icon: "➕", color: "#d97706" },
  { to: "/u/forecast", key: "forecast", icon: "📈", color: "#0e7490" },
  { to: "/u/alerts", key: "alerts", icon: "🔔", color: "#dc2626", badge: "alerts" },
  { to: "/u/messages", key: "messages", icon: "💬", color: "#0f766e", badge: "msgs" },
  { to: "/u/loan", key: "loan", icon: "🏦", color: "#7c3aed" },
];

export default function UdyamiLayout() {
  const { t } = useTranslation();
  const { displayName, lang, setLang, logout, online } = useStore();
  const [showGuide, setShowGuide] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);

  useEffect(() => {
    apiGet("/api/me/alerts")
      .then((a: any[]) => setAlertCount(a.filter((x) => !x.acked).length))
      .catch(() => {});
    const pollMsgs = () =>
      apiGet("/api/messages/unread").then((u: any) => setMsgCount(u.total ?? 0)).catch(() => {});
    void pollMsgs();
    const iv = setInterval(pollMsgs, 20_000);
    return () => clearInterval(iv);
  }, []);

  const badgeFor = (b?: string) => (b === "alerts" ? alertCount : b === "msgs" ? msgCount : 0);

  return (
    <div className="min-h-dvh md:flex">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:min-h-dvh bg-white border-r border-forest-800/8
        px-4 py-5 sticky top-0 max-h-dvh overflow-y-auto">
        <Wordmark />

        {/* user chip */}
        <div className="mt-4 card !rounded-xl px-3 py-2.5 flex items-center gap-2.5 bg-cream-50">
          <span className="h-8 w-8 rounded-full bg-forest-100 flex items-center justify-center text-sm" aria-hidden>👥</span>
          <span className="flex-1 text-[13px] font-bold text-forest-800 truncate">{displayName}</span>
          <span className="text-forest-800/35 text-xs" aria-hidden>▾</span>
        </div>

        <nav className="flex flex-col gap-1.5 mt-5" aria-label="Main">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end as any}
              className={({ isActive }) =>
                `press focus-ring flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition-all ${
                  isActive ? "text-white shadow-lift" : "text-forest-800/75 hover:bg-cream-100"}`}
              style={({ isActive }) => (isActive ? { background: tab.color } : undefined)}>
              {({ isActive }) => (
                <>
                  <span aria-hidden
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-base"
                    style={{ background: isActive ? "rgb(255 255 255 / 0.22)" : `${tab.color}1a` }}>
                    {tab.icon}
                  </span>
                  <span className="flex-1">{t(`nav.${tab.key}`)}</span>
                  {badgeFor(tab.badge) > 0 && (
                    <span className={`h-5 min-w-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      isActive ? "bg-white/25 text-white" : "bg-band-amber-soft text-band-amber"}`}>
                      {badgeFor(tab.badge)}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* village illustration */}
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
            भाषा / Language
          </button>
          <button onClick={logout}
            className="press focus-ring w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-forest-800/75 bg-forest-50 hover:bg-forest-100">
            <span className="h-7 w-7 rounded-lg bg-white flex items-center justify-center text-sm" aria-hidden>↪</span>
            {t("app.logout")}
          </button>
        </div>
      </aside>

      <div className="flex-1 pb-24 md:pb-8 max-w-xl md:max-w-6xl mx-auto w-full">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <Wordmark compact />
            <p className="text-xs text-forest-800/60 mt-0.5">{displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowGuide(true)} aria-label="Learn MIRA"
              className="chip bg-terra-600/10 text-terra-600 press focus-ring">❓</button>
            <button onClick={() => setLang(lang === "en" ? "hi" : "en")}
              className="chip bg-forest-100 text-forest-800 press focus-ring">{t("app.language")}</button>
            <button onClick={logout} className="chip bg-cream-200 text-forest-800 press focus-ring"
              aria-label={t("app.logout")}>⎋</button>
          </div>
        </header>

        {!online && <div className="px-4 md:px-6 pb-1 pt-0 md:pt-4"><OfflinePill text={t("app.offline")} /></div>}

        <main className="px-4 md:px-6 md:py-6 fade-in page-center">
          <Outlet />
        </main>
      </div>

      <MitraBot />

      {showGuide && (
        <Suspense fallback={null}>
          <Glossary onClose={() => setShowGuide(false)} />
        </Suspense>
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 max-w-xl mx-auto" aria-label="Main">
        <div className="m-3 card flex justify-around py-1.5 backdrop-blur"
          style={{ background: "rgba(255,255,255,0.95)" }}>
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end as any}
              className={({ isActive }) =>
                `press focus-ring flex flex-col items-center px-2 py-1 rounded-xl text-[11px] font-semibold transition-colors ${
                  isActive ? "" : "text-forest-800/50"}`}
              style={({ isActive }) => (isActive ? { color: tab.color, background: `${tab.color}14` } : undefined)}>
              <span className="text-xl relative" aria-hidden>
                {tab.icon}
                {badgeFor(tab.badge) > 0 && (
                  <span className="absolute -top-1 -right-2 h-4 min-w-4 px-0.5 rounded-full bg-band-red text-white text-[9px] font-bold flex items-center justify-center">
                    {badgeFor(tab.badge)}
                  </span>
                )}
              </span>
              {t(`nav.${tab.key}`)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
