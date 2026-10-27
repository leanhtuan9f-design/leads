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
  // Giới hạn theo gói (0 = không giới hạn); chỉ có khi tài khoản có gói thanh toán
  searchUsed?: number;
  searchLimit?: number;
  maxConcurrentSearches?: number;
  maxCountries?: number;
  countries?: string[];
  plan?: 'BASIC' | 'ADVANCED' | null; // gói đang dùng; Thống kê và Mẫu thư chỉ mở cho ADVANCED (và admin)
  hasPlan?: boolean; // true khi tài khoản có gói: không hiển thị hạn mức địa điểm mới/lượt quét mới
}

export interface AdminUserRow {
  id: number;
  email: string;
  role: 'admin' | 'user' | 'trial';
  createdAt?: number;
  dailyNew: number;
  dailyRefresh: number;
  disabled: boolean;
  newUsed: number;
  refreshUsed: number;
  plan?: 'BASIC' | 'ADVANCED' | null;
  maxCountries?: number;
  effectiveUntil?: number | null;
  planMaxCountries?: number;
  maxCountriesCustom?: boolean;
  countries?: string[];
  billingCycle?: 'MONTHLY' | 'ANNUAL' | null;
  effectiveFrom?: number | null;
  manualPlan?: boolean;
  searchUsed?: number;
  maxConcurrentSearches?: number;
  planMaxConcurrentSearches?: number;
  maxConcurrentCustom?: boolean;
  dailySearches?: number;
  planDailySearches?: number;
  dailySearchesCustom?: boolean;
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
