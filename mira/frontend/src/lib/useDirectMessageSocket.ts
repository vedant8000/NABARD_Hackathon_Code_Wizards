/** Live delivery for officer <-> SHG direct messages over WebSocket.
 * Auto-reconnects with backoff (rural connectivity drops constantly) —
 * callers should keep their existing REST polling as a fallback for when
 * the socket is down, and dedupe by message id when merging. */
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../api/client";
import { useStore } from "../state/store";

/** Same-origin in dev (Vite proxies /api, including WS upgrades). In
 * production the API_BASE http(s) origin is converted to ws(s). */
function wsOrigin(): string {
  if (API_BASE) return API_BASE.replace(/^http/, "ws");
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

export interface WsMessage {
  id: string;
  sender_role: string;
  sender_name: string;
  content: string;
  at: string;
}

type Frame =
  | { type: "message"; message: WsMessage }
  | { type: "error"; status: number; detail: string };

export function useDirectMessageSocket(
  enterpriseId: number,
  onMessage: (m: WsMessage) => void,
  onError?: (detail: string) => void,
) {
  const token = useStore((s) => s.token);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    let retryDelay = 1000;

    function connect() {
      if (cancelled) return;
      const url = `${wsOrigin()}/api/ws/messages/${enterpriseId}?token=${encodeURIComponent(token!)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        retryDelay = 1000;
      };
      ws.onmessage = (ev) => {
        let data: Frame;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.type === "message") onMessageRef.current(data.message);
        else if (data.type === "error") onErrorRef.current?.(data.detail);
      };
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enterpriseId, token]);

  function send(content: string): boolean {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ content }));
      return true;
    }
    return false;
  }

  return { connected, send };
}
