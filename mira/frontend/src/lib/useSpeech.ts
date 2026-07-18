/** Web Speech API hook — voice input in hi-IN (fallback en-IN).
 * Feature-detected; callers hide the mic when unsupported. */
import { useCallback, useEffect, useRef, useState } from "react";

const SR: any =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    : undefined;

export const speechSupported = Boolean(SR);

export function useSpeech(lang: "en" | "hi", onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  useEffect(() => () => recRef.current?.abort?.(), []);

  const start = useCallback(() => {
    if (!SR || listening) return;
    const rec = new SR();
    rec.lang = lang === "hi" ? "hi-IN" : "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript;
      if (text) cbRef.current(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [lang, listening]);

  const stop = useCallback(() => {
    recRef.current?.stop?.();
    setListening(false);
  }, []);

  return { listening, start, stop, supported: speechSupported };
}

/** TTS for low-literacy users — one tap reads an alert aloud. */
export function speak(text: string, lang: "en" | "hi") {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  speechSynthesis.speak(u);
}
