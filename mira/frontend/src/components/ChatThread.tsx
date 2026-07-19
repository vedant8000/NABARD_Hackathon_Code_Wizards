/** Officer ↔ enterprise message thread. WebSocket pushes new messages live;
 * REST polling (30s) stays as a fallback for whenever the socket is down —
 * rural connectivity drops constantly, so neither path is trusted alone.
 * Own messages render right (green); the other side renders left (white). */
import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { useStore } from "../state/store";
import { useDirectMessageSocket, type WsMessage } from "../lib/useDirectMessageSocket";
import { Skeleton } from "./ui";

interface Msg {
  id: string; sender_role: string; sender_name: string;
  content: string; at: string; mine: boolean;
}

export default function ChatThread({ enterpriseId, height = 380 }: {
  enterpriseId: number; height?: number;
}) {
  const { lang, online, role } = useStore();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  const load = async () => {
    try {
      const d = await apiGet(`/api/messages/${enterpriseId}`);
      setMsgs(d.messages);
    } catch { /* keep last */ }
  };

  useEffect(() => {
    firstLoad.current = true;
    setMsgs(null);
    void load();
    const iv = setInterval(() => void load(), 30000);
    return () => clearInterval(iv);
  }, [enterpriseId]);

  useEffect(() => {
    if (!msgs) return;
    endRef.current?.scrollIntoView({ behavior: firstLoad.current ? "auto" : "smooth" });
    firstLoad.current = false;
  }, [msgs?.length]);

  const { connected, send: sendOverSocket } = useDirectMessageSocket(
    enterpriseId,
    (m: WsMessage) => {
      setMsgs((prev) => {
        const mine = m.sender_role === role;
        const next: Msg = { ...m, mine };
        if (!prev) return [next];
        if (prev.some((x) => x.id === next.id)) return prev;
        return [...prev, next];
      });
    },
    (detail) => setSendErr(detail),
  );

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendErr("");
    setInput("");
    try {
      if (!sendOverSocket(text)) {
        await apiPost(`/api/messages/${enterpriseId}`, { content: text });
        await load();
      }
    } catch (e: any) {
      setInput(text); // restore on failure
      setSendErr(e?.message ?? "Could not send — try again.");
    } finally {
      setSending(false);
    }
  }

  const timeLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(lang === "hi" ? "hi-IN" : "en-IN",
      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-cream-50 rounded-xl border border-forest-800/6">
        {msgs === null ? (
          <div className="space-y-2"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-10 w-1/2 ml-auto" /></div>
        ) : msgs.length === 0 ? (
          <p className="text-center text-sm text-forest-800/50 py-8">
            💬 {lang === "hi" ? "अभी कोई संदेश नहीं — बातचीत शुरू करें।" : "No messages yet — start the conversation."}
          </p>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft ${
                m.mine
                  ? "bg-forest-700 text-white rounded-br-md"
                  : "bg-white border border-forest-800/8 text-forest-800 rounded-bl-md"}`}>
                {!m.mine && (
                  <p className="text-[10px] font-bold opacity-60 mb-0.5">
                    {m.sender_role === "officer" ? "👩‍💼 " : "🌾 "}{m.sender_name}
                  </p>
                )}
                <p className="whitespace-pre-wrap leading-snug">{m.content}</p>
                <p className={`text-[9.5px] mt-1 tabular-nums ${m.mine ? "text-white/60" : "text-forest-800/40"}`}>
                  {timeLabel(m.at)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {sendErr && (
        <p className="text-[11.5px] text-band-red font-semibold mt-2" role="alert">⚠ {sendErr}</p>
      )}
      <p className="text-[10px] text-forest-800/40 mt-1.5 flex items-center gap-1">
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-forest-800/25"}`} aria-hidden />
        {connected
          ? (lang === "hi" ? "लाइव" : "Live")
          : (lang === "hi" ? "पुनः जुड़ रहे हैं…" : "Reconnecting…")}
      </p>
      <form className="flex gap-2 mt-1.5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          disabled={!online}
          placeholder={!online
            ? (lang === "hi" ? "संदेश के लिए इंटरनेट चाहिए" : "Messaging needs internet")
            : (lang === "hi" ? "संदेश लिखें…" : "Type a message…")}
          className="focus-ring flex-1 rounded-xl border border-forest-800/14 bg-white px-3.5 py-2.5 text-sm disabled:opacity-60" />
        <button type="submit" disabled={sending || !input.trim() || !online}
          className="btn-primary focus-ring px-4 disabled:opacity-50" aria-label="Send">
          ➤
        </button>
      </form>
    </div>
  );
}
