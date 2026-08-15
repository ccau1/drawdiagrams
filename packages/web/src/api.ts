// Tiny REST client with token persistence.
import type { BoardFull, BoardMeta, Declaration, Org, User } from "./types";

const TOKEN_KEY = "drawboard.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t: string) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function req<T>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  register: (email: string, name: string, password: string) =>
    req<{ token: string; user: User; orgId: string }>("POST", "/api/register", { email, name, password }),
  login: (email: string, password: string) =>
    req<{ token: string; user: User; orgId: string }>("POST", "/api/login", { email, password }),
  me: () => req<{ user: User; orgs: Org[] }>("GET", "/api/me"),
  orgs: () => req<Org[]>("GET", "/api/orgs"),
  createOrg: (name: string) => req<Org>("POST", "/api/orgs", { name }),
  addMember: (orgId: string, email: string) =>
    req<Org[]>("POST", `/api/orgs/${orgId}/members`, { email }),
  boards: (orgId: string) => req<BoardMeta[]>("GET", `/api/orgs/${orgId}/boards`),
  createBoard: (orgId: string, name: string) =>
    req<BoardMeta>("POST", `/api/orgs/${orgId}/boards`, { name }),
  board: (id: string) => req<BoardFull>("GET", `/api/boards/${id}`),
  saveBoard: (id: string, elements: any, appState: any) =>
    req<{ ok: boolean }>("PUT", `/api/boards/${id}`, { elements, appState }),
  deleteBoard: (id: string) => req<{ ok: boolean }>("DELETE", `/api/boards/${id}`),
  shareBoard: (id: string, shared: boolean) =>
    req<{ ok: boolean; shared: boolean }>("POST", `/api/boards/${id}/share`, { shared }),
  integrations: () => req<Declaration[]>("GET", "/api/integrations"),
  deletePlugin: (name: string) => req<{ ok: boolean }>("DELETE", `/api/plugins/${name}`),
  uploadPlugin: async (file: File): Promise<Declaration> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/plugins/upload", {
      method: "POST",
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
};
