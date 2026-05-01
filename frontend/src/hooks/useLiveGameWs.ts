// useLiveGameWs.ts
import { useEffect, useRef, useState } from "react";
import useSocket from "@/hooks/useSockets";
import type { LiveGameWsEvent } from "@/lib/types";

export function useLiveGameWs() {
  const { connectWebSocket } = useSocket();
  const [latestEvent, setLatestEvent] = useState<LiveGameWsEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    let destroyed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const closeSocket = () => {
      if (!socketRef.current) return;
      const s = socketRef.current;
      socketRef.current = null;
      if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) {
        s.close();
      }
    };

    const scheduleReconnect = () => {
      if (destroyed) return;
      if (!navigator.onLine) {
        setConnected(false);
        setReconnecting(true);
        return;
      }

      attemptRef.current += 1;
      setReconnectAttempt(attemptRef.current);
      setReconnecting(true);

      const baseDelay = Math.min(10000, 500 * 2 ** Math.min(attemptRef.current - 1, 5));
      const jitter = Math.floor(Math.random() * 250);
      const delay = baseDelay + jitter;
      clearReconnectTimer();
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = () => {
      if (destroyed) return;
      clearReconnectTimer();
      closeSocket();

      const socket = connectWebSocket("/ws");
      socketRef.current = socket;

      socket.onopen = () => {
        if (destroyed) {
          socket.close();
          return;
        }
        attemptRef.current = 0;
        setReconnectAttempt(0);
        setConnected(true);
        setReconnecting(false);
        socket.send(JSON.stringify({ type: "join", roomId: "game" }));
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const msg: LiveGameWsEvent = JSON.parse(event.data);
          setLatestEvent(msg);
        } catch {
          // ignore malformed
        }
      };

      socket.onerror = () => {
        setConnected(false);
      };

      socket.onclose = () => {
        setConnected(false);
        scheduleReconnect();
      };
    };

    const handleOnline = () => {
      if (destroyed) return;
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) return;
      setReconnecting(true);
      connect();
    };

    const handleOffline = () => {
      setConnected(false);
      setReconnecting(true);
      closeSocket();
      clearReconnectTimer();
    };

    connect();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      destroyed = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearReconnectTimer();
      closeSocket();
    };
  }, [connectWebSocket]);

  return { latestEvent, connected, reconnecting, reconnectAttempt };
}
