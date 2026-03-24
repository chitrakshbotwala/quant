import { useEffect, useRef } from 'react';

type WsEvent =
  | { type: 'connecting'; at: number; attempt: number }
  | { type: 'open'; at: number; attempt: number }
  | { type: 'message'; at: number }
  | { type: 'close'; at: number; code?: number; reason?: string; willRetryInMs: number; nextAttempt: number }
  | { type: 'error'; at: number; message: string };

function getWebSocketBaseUrl() {
  const explicitBase = import.meta.env.VITE_WS_BASE_URL as string | undefined;
  if (explicitBase && explicitBase.trim()) {
    return explicitBase.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    return 'ws://127.0.0.1:4000';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}`;
}

export function useWebSocket(roundId: number, onMessage: (data: any) => void, onEvent?: (event: WsEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('kronosphere_token');
    if (!token) return;

    let stopped = false;
    let retryTimer: number | null = null;
    let attempt = 0;
    const retryMs = 1500;

    const connect = () => {
      if (stopped) return;
      attempt += 1;
      onEvent?.({ type: 'connecting', at: Date.now(), attempt });

      const wsBaseUrl = getWebSocketBaseUrl();
      const ws = new WebSocket(`${wsBaseUrl}/ws/round/${roundId}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        onEvent?.({ type: 'open', at: Date.now(), attempt });
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          onEvent?.({ type: 'message', at: Date.now() });
          onMessage(parsed);
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        onEvent?.({ type: 'error', at: Date.now(), message: 'WebSocket transport error' });
      };

      ws.onclose = (event) => {
        if (stopped) return;
        const nextAttempt = attempt + 1;
        onEvent?.({
          type: 'close',
          at: Date.now(),
          code: event.code,
          reason: event.reason,
          willRetryInMs: retryMs,
          nextAttempt
        });
        retryTimer = window.setTimeout(connect, retryMs);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      wsRef.current?.close();
    };
  }, [roundId, onMessage, onEvent]);

  return wsRef;
}
