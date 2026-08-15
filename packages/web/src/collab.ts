// Collaboration client: relays scene ops, cursors and reactions over WS.
import { getToken } from "./api";

export type WireMsg = {
  type: "presence" | "join" | "leave" | "op" | "cursor" | "reaction";
  from?: string; name?: string; payload?: any;
};

type Handler = (m: WireMsg) => void;

export class CollabClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private closed = false;
  private outbox: string[] = [];

  constructor(private boardId: string, private onMsg: Handler, private onStatus: (online: boolean) => void) {
    this.connect();
  }

  private connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws?board=${this.boardId}&token=${encodeURIComponent(getToken())}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus(true);
      for (const m of this.outbox) ws.send(m);
      this.outbox = [];
    };
    ws.onmessage = (e) => {
      try { this.onMsg(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    ws.onclose = () => {
      this.onStatus(false);
      if (this.closed) return;
      const wait = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.closed && this.connect(), wait);
    };
    ws.onerror = () => ws.close();
  }

  send(m: WireMsg) {
    const raw = JSON.stringify({ ...m, board: this.boardId });
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(raw);
    else this.outbox.push(raw);
  }

  close() { this.closed = true; this.ws?.close(); }
}
