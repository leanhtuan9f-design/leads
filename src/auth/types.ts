export interface AuthUser {
  id: number;
  email: string;
  role: 'admin' | 'user' | 'trial';
}

export interface Quota {
  newUsed: number;
  newLimit: number;
  refreshUsed: number;
  refreshLimit: number;
}

export interface AdminUserRow {
  id: number;
  email: string;
  role: 'admin' | 'user';
  dailyNew: number;
  dailyRefresh: number;
  disabled: boolean;
  newUsed: number;
  refreshUsed: number;
}

export async function apiJson<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401 && !['/auth/login', '/auth/me', '/trial/start'].includes(path)) {
    window.dispatchEvent(new Event('auth:expired'));
  }
  if (!resp.ok) throw new Error((data as { error?: string }).error || `Lỗi ${resp.status}`);
  return data as T;
}
