import React, { useState } from 'react';
import { User, LogOut, KeyRound } from 'lucide-react';
import { apiJson, AuthUser, Quota } from '../auth/types';

interface AccountMenuProps {
  user: AuthUser;
  quota: Quota | null;
  onLogout: () => void;
}

export const AccountMenu: React.FC<AccountMenuProps> = ({ user, quota, onLogout }) => {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiJson('/auth/password', 'POST', { current: cur, next: nw });
      setMsg({ ok: true, text: 'Đã đổi mật khẩu' });
      setCur(''); setNw('');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Lỗi' });
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        title={user.email}
      >
        <User className="w-3.5 h-3.5 text-blue-400" />
        {quota && (
          <span className="font-mono tabular-nums text-[11px]">{quota.newUsed}/{quota.newLimit}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl p-3 space-y-3 z-50 text-xs">
          <div>
            <div className="text-white font-semibold break-all">{user.email}</div>
            <div className="text-slate-500">{user.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}</div>
          </div>
          {quota && (
            <div className="space-y-1 text-slate-300">
              <div>Địa điểm mới hôm nay: <strong className="text-white font-mono">{quota.newUsed}/{quota.newLimit}</strong></div>
              <div>Lượt cào mới hoàn toàn: <strong className="text-white font-mono">{quota.refreshUsed}/{quota.refreshLimit}</strong></div>
              <div className="text-[10px] text-slate-500">Dữ liệu lấy từ kho đã lưu không bị tính. Đặt lại lúc 0h (giờ Việt Nam).</div>
            </div>
          )}
          {changing ? (
            <form onSubmit={changePassword} className="space-y-2">
              <input type="password" required placeholder="Mật khẩu hiện tại" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
              <input type="password" required minLength={10} placeholder="Mật khẩu mới (từ 10 ký tự)" value={nw} onChange={e => setNw(e.target.value)} autoComplete="new-password"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
              {msg && <div className={msg.ok ? 'text-emerald-300' : 'text-red-300'}>{msg.text}</div>}
              <button type="submit" className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium">Lưu mật khẩu</button>
            </form>
          ) : (
            <button onClick={() => setChanging(true)} className="w-full flex items-center gap-1.5 text-slate-300 hover:text-white">
              <KeyRound className="w-3.5 h-3.5" /> Đổi mật khẩu
            </button>
          )}
          <button onClick={onLogout} className="w-full flex items-center gap-1.5 text-red-300 hover:text-red-200">
            <LogOut className="w-3.5 h-3.5" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
};
