import React, { useState } from 'react';
import { APP_NAME, APP_TAGLINE } from '../config/brand';
import { apiJson, AuthUser, Quota } from '../auth/types';

interface LoginFormProps {
  onLoggedIn: (user: AuthUser, quota: Quota) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoggedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await apiJson<{ user: AuthUser; quota: Quota }>('/auth/login', 'POST', { email, password });
      onLoggedIn(r.user, r.quota);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-4 shadow-2xl">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold text-white">{APP_NAME}</h1>
          <p className="text-xs text-slate-400">{APP_TAGLINE}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
          <input
            type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Mật khẩu</label>
          <input
            type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
          />
        </div>
        {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/40 rounded-md p-2">{error}</div>}
        <button
          type="submit" disabled={busy}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm rounded-lg transition-colors"
        >
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
        <p className="text-[11px] text-slate-500 text-center">Tài khoản do quản trị viên cấp. Liên hệ quản trị viên nếu bạn chưa có tài khoản.</p>
      </form>
    </div>
  );
};
