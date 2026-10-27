import React, { useCallback, useEffect, useState } from 'react';
import App from '../App';
import { LoginForm } from '../components/LoginForm';
import { apiJson, AuthUser, Quota } from './types';

interface MeResponse { user: AuthUser; quota: Quota }

// Bọc ứng dụng: chưa đăng nhập thì chỉ hiện form đăng nhập
export default function AuthGate() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);

  const refreshQuota = useCallback(async () => {
    try {
      const me = await apiJson<MeResponse>('/auth/me');
      setUser(me.user);
      setQuota(me.quota);
    } catch {
      /* giữ nguyên trạng thái hiện tại */
    }
  }, []);

  useEffect(() => {
    apiJson<MeResponse & { trial?: boolean }>('/trial/start', 'POST', {})
      .then(me => { setUser(me.user); setQuota(me.quota); setState('in'); })
      .catch(() => setState('out'));
    const onExpired = () => { setUser(null); setQuota(null); setState('out'); };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const logout = async () => {
    try { await apiJson('/auth/logout', 'POST', {}); } catch { /* bỏ qua */ }
    setUser(null); setQuota(null); setState('out');
  };

  if (state === 'loading') {
    return <div className="min-h-screen bg-[#0a1417] flex items-center justify-center text-slate-500 text-sm">Đang tải...</div>;
  }
  if (state === 'out' || !user) {
    return <LoginForm onLoggedIn={(u, q) => { setUser(u); setQuota(q); setState('in'); }} />;
  }
  return <App key={user.id} user={user} quota={quota} onLogout={logout} refreshQuota={refreshQuota} />;
}
