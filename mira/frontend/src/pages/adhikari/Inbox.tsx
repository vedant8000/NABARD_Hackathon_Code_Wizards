/** Officer inbox — a triaged message center, not a chat app.
 * Threads sort by: unread first → risk band (red > amber > green) → newest.
 * Selecting a thread opens the conversation with enterprise context. */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../../state/store";
import { apiGet } from "../../api/client";
import { ErrorState, Skeleton } from "../../components/ui";
import ChatThread from "../../components/ChatThread";
import PageHero from "../../components/PageHero";
import { BAND_COLOR, SECTOR_ICON, type Band } from "../../lib/format";

interface Thread {
  enterprise_id: number; name: string; village: string; sector: string;
  band: Band; score: number | null; unread: number; message_count: number;
  last_content: string; last_sender: string; last_at: string;
}

export default function Inbox() {
  const { lang } = useStore();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const load = () => {
    apiGet("/api/messages/threads")
      .then((t: Thread[]) => {
        setThreads(t);
        setSel((cur) => cur ?? t[0]?.enterprise_id ?? null);
      })
      .catch((e) => setErr(e.message));
  };
  useEffect(() => {
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, []);

  const visible = useMemo(
    () => (threads ?? []).filter((t) => !q ||
      t.name.toLowerCase().includes(q.toLowerCase()) ||
      (t.village ?? "").toLowerCase().includes(q.toLowerCase())),
    [threads, q]);

  const selected = threads?.find((t) => t.enterprise_id === sel) ?? null;
  const totalUnread = (threads ?? []).reduce((s, t) => s + t.unread, 0);

  const timeLabel = (iso: string) => new Date(iso).toLocaleString(
    lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (err) return <ErrorState message={err} onRetry={load} retryLabel="Retry" />;

  return (
    <div className="space-y-3.5">
      <PageHero icon="📥" title={lang === "hi" ? "संदेश पेटी" : "Inbox"}
        sub={lang === "hi"
          ? "उद्यमियों के संदेश — जोखिम के क्रम में। लाल बैंड वाले सबसे ऊपर, ताकि ज़रूरी बात पहले दिखे।"
          : "Messages from your beneficiaries — triaged by risk. At-risk enterprises surface first, so the urgent voice is never buried."}
        from="#0f766e" to="#134e4a" emojis={["💬", "🤝", "🌾"]}
        right={totalUnread > 0 ? (
          <span className="chip bg-white/90 text-[#134e4a] font-extrabold">
            {totalUnread} {lang === "hi" ? "अपठित" : "unread"}
          </span>
        ) : undefined} />

      <div className="grid lg:grid-cols-5 gap-3.5 items-start">
        {/* ── thread list ── */}
        <section className="card p-3 lg:col-span-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={lang === "hi" ? "नाम या गाँव खोजें…" : "Search name or village…"}
            className="focus-ring w-full rounded-xl border border-forest-800/12 bg-cream-50 px-3.5 py-2.5 text-sm mb-2" />
          {threads === null ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : visible.length === 0 ? (
            <p className="text-center text-sm text-forest-800/50 py-10">
              📭 {lang === "hi" ? "अभी कोई बातचीत नहीं। किसी उद्यम के 360° से संदेश शुरू करें।" : "No conversations yet. Start one from any enterprise's 360° page."}
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {visible.map((t) => (
                <li key={t.enterprise_id}>
                  <button onClick={() => { setSel(t.enterprise_id); }}
                    className={`press focus-ring w-full rounded-xl p-3 text-left border transition-all ${
                      sel === t.enterprise_id
                        ? "border-[#0f766e]/40 bg-[#0f766e]/6 shadow-soft"
                        : t.unread > 0
                          ? "border-band-amber/30 bg-band-amber-soft/40"
                          : "border-forest-800/8 bg-white hover:bg-cream-50"}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="relative h-9 w-9 rounded-full bg-cream-100 flex items-center justify-center text-base shrink-0" aria-hidden>
                        {SECTOR_ICON[t.sector] ?? "🌾"}
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
                          style={{ background: BAND_COLOR[t.band] }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-[13px] truncate ${t.unread ? "font-extrabold text-forest-800" : "font-bold text-forest-800/85"}`}>
                            {t.name}
                          </p>
                          <span className="ml-auto text-[10px] text-forest-800/45 tabular-nums shrink-0">{timeLabel(t.last_at)}</span>
                        </div>
                        <p className="text-[11.5px] text-forest-800/55 truncate">
                          {t.last_sender === "officer" ? (lang === "hi" ? "आप: " : "You: ") : ""}
                          {t.last_content}
                        </p>
                      </div>
                      {t.unread > 0 && (
                        <span className="h-5 min-w-5 px-1 rounded-full bg-[#0f766e] text-white text-[10.5px] font-bold flex items-center justify-center shrink-0">
                          {t.unread}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── conversation ── */}
        <section className="card p-4 lg:col-span-3">
          {selected ? (
            <>
              <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                <span className="h-10 w-10 rounded-full bg-cream-100 flex items-center justify-center text-lg" aria-hidden>
                  {SECTOR_ICON[selected.sector] ?? "🌾"}
                </span>
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="font-bold text-forest-800 truncate">{selected.name}</p>
                  <p className="text-[11px] text-forest-800/55">{selected.village}</p>
                </div>
                {selected.score != null && (
                  <span className="chip !text-[11px] tabular-nums"
                    style={{ background: `${BAND_COLOR[selected.band]}1c`, color: BAND_COLOR[selected.band] }}>
                    ● {Math.round(selected.score)} / 100
                  </span>
                )}
                <Link to={`/a/enterprises/${selected.enterprise_id}`}
                  className="press focus-ring chip bg-forest-100 text-forest-800 !text-[11.5px]">
                  {lang === "hi" ? "360° देखें" : "View 360°"} ›
                </Link>
              </div>
              <ChatThread enterpriseId={selected.enterprise_id} height={420} />
            </>
          ) : (
            <p className="text-center text-sm text-forest-800/50 py-24">
              💬 {lang === "hi" ? "बाईं ओर से बातचीत चुनें" : "Select a conversation on the left"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
