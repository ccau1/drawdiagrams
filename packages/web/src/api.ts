// Tiny REST client with token persistence.
import type { BoardFull, BoardMeta, Declaration, Folder, Org, User } from "./types";

const TOKEN_KEY = "drawboard.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t: string) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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
  if (!res.ok) throw new ApiError(res.status, data.error || `HTTP ${res.status}`);
  return data as T;
}

export const REDIRECT_AFTER_LOGIN_KEY = "drawboard.redirectAfterLogin";

export interface AuthConfig {
  localEnabled: boolean;
  providers: { id: string; name: string; authUrl: string }[];
}

export const api = {
  authConfig: () => req<AuthConfig>("GET", "/api/auth/config"),
  register: (email: string, username: string, name: string, password: string) =>
    req<{ token: string; user: User; orgId: string }>("POST", "/api/register", { email, username, name, password }),
  login: (usernameOrEmail: string, password: string) =>
    req<{ token: string; user: User; orgId: string }>("POST", "/api/login", { usernameOrEmail, password }),
  me: () => req<{ user: User; orgs: Org[] }>("GET", "/api/me"),
  orgs: () => req<Org[]>("GET", "/api/orgs"),
  createOrg: (name: string) => req<Org>("POST", "/api/orgs", { name }),
  addMember: (orgId: string, email: string) =>
    req<Org[]>("POST", `/api/orgs/${orgId}/members`, { email }),
  boards: (orgId: string) => req<BoardMeta[]>("GET", `/api/orgs/${orgId}/boards`),
  createBoard: (orgId: string, name: string, folderId?: string) =>
    req<BoardMeta>("POST", `/api/orgs/${orgId}/boards`, { name, folderId }),
  folders: (orgId: string) => req<Folder[]>("GET", `/api/orgs/${orgId}/folders`),
  createFolder: (orgId: string, name: string, parentId?: string) =>
    req<Folder>("POST", `/api/orgs/${orgId}/folders`, { name, parentId }),
  moveBoard: (id: string, folderId: string) =>
    req<{ ok: boolean }>("POST", `/api/boards/${id}/move`, { folderId }),
  moveFolder: (id: string, parentId: string) =>
    req<{ ok: boolean }>("POST", `/api/folders/${id}/move`, { parentId }),
  deleteFolder: (id: string) => req<{ ok: boolean }>("DELETE", `/api/folders/${id}`),
  board: (id: string) => req<BoardFull>("GET", `/api/boards/${id}`),
  saveBoard: (id: string, elements: any, appState: any) =>
    req<{ ok: boolean }>("PUT", `/api/boards/${id}`, { elements, appState }),
  saveThumbnail: (id: string, thumbnail: string) =>
    req<{ ok: boolean }>("POST", `/api/boards/${id}/thumbnail`, { thumbnail }),
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
