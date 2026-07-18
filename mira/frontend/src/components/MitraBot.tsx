/** MitraBot — floating chat widget, both personas.
 * Streams from POST /api/chat (SSE). Offline → honest disabled state.
 * Other screens can pre-fill a question via the exported openMitraBot(). */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiChatStream } from "../api/client";
import { useStore } from "../state/store";
import { useSpeech } from "../lib/useSpeech";

type Msg = { role: "user" | "model"; content: string };

let externalOpen: ((prefill?: string) => void) | null = null;
export function openMitraBot(prefill?: string) {
  externalOpen?.(prefill);
}

export default function MitraBot() {
  const { t } = useTranslation();
  const { lang, role, online } = useStore();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const speech = useSpeech(lang, (text) => setInput((v) => (v ? v + " " : "") + text));

  useEffect(() => {
    externalOpen = (prefill) => {
      setOpen(true);
      if (prefill) setInput(prefill);
    };
    return () => { externalOpen = null; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const history = [...msgs, { role: "user" as const, content: q }];
    setMsgs([...history, { role: "model", content: "" }]);
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      await apiChatStream(
        { messages: history, lang },
        (delta) =>
          setMsgs((cur) => {
            const copy = [...cur];
            copy[copy.length - 1] = {
              role: "model",
              content: copy[copy.length - 1].content + delta,
            };
            return copy;
          }),
        abortRef.current.signal,
      );
    } catch (e: any) {
      setMsgs((cur) => {
        const copy = [...cur];
        copy[copy.length - 1] = { role: "model", content: e.message ?? "…" };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  const chips: string[] = (t(role === "officer" ? "bot.chipsOfficer" : "bot.chips",
    { returnObjects: true }) as string[]) ?? [];

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("bot.title")}
        className="press focus-ring fixed bottom-24 md:bottom-6 right-4 z-40 h-14 w-14 rounded-full
          bg-forest-700 hover:bg-forest-600 text-white text-2xl shadow-lift transition-colors">
        {open ? "✕" : "🤖"}
        {!open && (
          <span className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-band-red border-2 border-white"
            aria-hidden />
        )}
      </button>

      {open && (
        <div
          role="dialog" aria-label={t("bot.title")}
          className="fixed z-40 inset-x-2 bottom-40 md:inset-auto md:right-6 md:bottom-24
            md:w-[380px] card flex flex-col overflow-hidden fade-in"
          style={{ height: "min(480px, 62dvh)" }}>
          <header className="flex items-center gap-2 px-4 py-3 bg-forest-800 text-white">
            <span className="text-xl" aria-hidden>🤖</span>
            <div>
              <p className="font-bold leading-none">{t("bot.title")}</p>
              <p className="text-[11px] opacity-75">MIRA · Gemini</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-cream-50">
            <BotBubble text={t(role === "officer" ? "bot.helloOfficer" : "bot.hello")} />
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="ml-10 rounded-2xl rounded-br-md bg-forest-800 text-white px-3 py-2 text-sm w-fit max-w-[85%] justify-self-end"
                  style={{ marginLeft: "auto" }}>{m.content}</p>
              ) : (
                <BotBubble key={i} text={m.content || "…"} typing={busy && i === msgs.length - 1 && !m.content} />
              ),
            )}
            <div ref={endRef} />
          </div>

          {msgs.length === 0 && (
            <div className="flex gap-1.5 flex-wrap px-3 pb-2 bg-cream-50">
              {chips.map((c) => (
                <button key={c} onClick={() => void send(c)}
                  className="chip bg-forest-100 text-forest-800 press focus-ring">{c}</button>
              ))}
            </div>
          )}

          <footer className="p-2 border-t border-forest-800/10 bg-white">
            {!online ? (
              <p className="text-xs text-center text-forest-800/60 py-1.5">📴 {t("bot.offline")}</p>
            ) : (
              <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                <input
                  value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder={t("bot.placeholder")}
                  className="focus-ring flex-1 rounded-xl border border-forest-800/15 px-3 py-2 text-sm"
                />
                {speech.supported && (
                  <button type="button" aria-label="Voice input" aria-pressed={speech.listening}
                    onClick={() => (speech.listening ? speech.stop() : speech.start())}
                    className={`press focus-ring rounded-xl px-3 ${speech.listening ? "bg-band-red text-white" : "bg-cream-200"}`}>
                    🎤
                  </button>
                )}
                <button type="submit" disabled={busy || !input.trim()}
                  className="press focus-ring rounded-xl bg-forest-800 text-white px-3 font-bold disabled:opacity-50">
                  ➤
                </button>
              </form>
            )}
          </footer>
        </div>
      )}
    </>
  );
}

/** Markdown-lite: escape HTML, then render **bold**, bullets and headings. */
function renderLite(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split("\n")
    .map((line) => {
      let l = line.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      l = l.replace(/^#{1,4}\s*(.*)$/, "<b>$1</b>");
      l = l.replace(/^\s*[*•-]\s+/, "&nbsp;•&nbsp;");
      l = l.replace(/^\s*(\d+)\.\s+/, "&nbsp;$1.&nbsp;");
      return l;
    })
    .join("<br/>");
}

function BotBubble({ text, typing }: { text: string; typing?: boolean }) {
  return (
    <div className="mr-10 rounded-2xl rounded-bl-md bg-white border border-forest-800/8 px-3 py-2 text-sm w-fit max-w-[85%] shadow-soft leading-relaxed">
      {typing
        ? <span className="animate-pulse">●●●</span>
        : <span dangerouslySetInnerHTML={{ __html: renderLite(text) }} />}
    </div>
  );
}
