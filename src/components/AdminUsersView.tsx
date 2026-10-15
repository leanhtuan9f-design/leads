import React, { useCallback, useEffect, useState } from 'react';
import { apiJson, AdminUserRow } from '../auth/types';

export const AdminUsersView: React.FC<{ currentUserId: number }> = ({ currentUserId }) => {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', dailyNew: 200, dailyRefresh: 3, role: 'user' });

  const load = useCallback(async () => {
    try {
      const r = await apiJson<{ users: AdminUserRow[] }>('/admin/users');
      setUsers(r.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải danh sách');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copyCreds = async () => {
    if (!creds) return;
    const text = `Đăng nhập: ${window.location.origin}\nEmail: ${creds.email}\nMật khẩu: ${creds.password}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea'); // trình duyệt không cho clipboard API (http / quyền)
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice(''); setCreds(null);
    try {
      const r = await apiJson<{ email: string; password: string }>('/admin/users', 'POST', {
        email: form.email, password: form.password || undefined,
        dailyNew: Number(form.dailyNew), dailyRefresh: Number(form.dailyRefresh), role: form.role
      });
      setNotice(`Đã tạo tài khoản ${r.email}. Mật khẩu chỉ hiện một lần — hãy sao chép gửi cho người dùng.`);
      setCreds({ email: r.email, password: r.password });
      setForm({ ...form, email: '', password: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi');
    }
  };

  const patch = async (id: number, body: Record<string, unknown>) => {
    setError(''); setNotice(''); setCreds(null);
    try {
      const r = await apiJson<{ newPassword?: string }>(`/admin/users/${id}`, 'PATCH', body);
      if (r.newPassword) {
        const target = users.find(x => x.id === id);
        setNotice(`Đã đặt lại mật khẩu cho ${target?.email ?? 'tài khoản'}. Mật khẩu chỉ hiện một lần — hãy sao chép gửi cho người dùng.`);
        setCreds({ email: target?.email ?? '', password: r.newPassword });
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi');
    }
  };

  const editLimit = (u: AdminUserRow, field: 'dailyNew' | 'dailyRefresh', label: string) => {
    const v = window.prompt(`${label} cho ${u.email}:`, String(u[field]));
    if (v === null) return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) { setError('Giá trị không hợp lệ'); return; }
    patch(u.id, { [field]: n });
  };

  const input = 'bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500';

  return (
    <div className="space-y-5 text-xs">
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
        <h2 className="text-sm font-bold text-white mb-3">Tạo tài khoản mới</h2>
        <form onSubmit={create} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <label className="col-span-2 text-slate-400">Email
            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={`${input} w-full mt-1`} />
          </label>
          <label className="col-span-2 text-slate-400">Mật khẩu (để trống = tự sinh)
            <input type="text" minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={`${input} w-full mt-1`} />
          </label>
          <label className="text-slate-400">Địa điểm mới/ngày
            <input type="number" min={0} value={form.dailyNew} onChange={e => setForm({ ...form, dailyNew: Number(e.target.value) })} className={`${input} w-full mt-1`} />
          </label>
          <label className="text-slate-400">Làm mới/ngày
            <input type="number" min={0} value={form.dailyRefresh} onChange={e => setForm({ ...form, dailyRefresh: Number(e.target.value) })} className={`${input} w-full mt-1`} />
          </label>
          <button type="submit" className="col-span-2 md:col-span-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md">Tạo tài khoản</button>
        </form>
        {notice && (
          <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/40 rounded text-emerald-200 space-y-2">
            <div>{notice}</div>
            {creds && (
              <>
                <div className="font-mono bg-slate-950/60 rounded p-2 break-all select-all">
                  Email: {creds.email}<br />Mật khẩu: {creds.password}
                </div>
                <button type="button" onClick={copyCreds} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md">
                  {copied ? '✓ Đã sao chép' : 'Sao chép thông tin đăng nhập'}
                </button>
              </>
            )}
          </div>
        )}
        {error && <div className="mt-3 p-2 bg-red-500/10 border border-red-500/40 rounded text-red-200">{error}</div>}
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="p-2.5">Email</th><th className="p-2.5">Quyền</th>
              <th className="p-2.5">Địa điểm mới hôm nay</th><th className="p-2.5">Làm mới hôm nay</th>
              <th className="p-2.5">Trạng thái</th><th className="p-2.5">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-slate-800 text-slate-200">
                <td className="p-2.5 break-all">{u.email}{u.id === currentUserId && <span className="text-slate-500"> (bạn)</span>}</td>
                <td className="p-2.5">{u.role === 'admin' ? 'Admin' : 'Người dùng'}</td>
                <td className="p-2.5 font-mono">{u.newUsed} / {u.dailyNew}</td>
                <td className="p-2.5 font-mono">{u.refreshUsed} / {u.dailyRefresh}</td>
                <td className="p-2.5">{u.disabled ? <span className="text-red-300">Đã khóa</span> : <span className="text-emerald-300">Hoạt động</span>}</td>
                <td className="p-2.5 space-x-2 whitespace-nowrap">
                  <button onClick={() => editLimit(u, 'dailyNew', 'Hạn mức địa điểm mới/ngày')} className="text-blue-400 hover:text-blue-300">Đổi hạn mức</button>
                  <button onClick={() => editLimit(u, 'dailyRefresh', 'Số lần làm mới/ngày')} className="text-blue-400 hover:text-blue-300">Đổi lượt làm mới</button>
                  <button onClick={() => { if (window.confirm(`Đặt lại mật khẩu cho ${u.email}?`)) patch(u.id, { resetPassword: true }); }} className="text-amber-300 hover:text-amber-200">Đặt lại MK</button>
                  {u.id !== currentUserId && (
                    <button onClick={() => patch(u.id, { disabled: !u.disabled })} className={u.disabled ? 'text-emerald-300 hover:text-emerald-200' : 'text-red-300 hover:text-red-200'}>
                      {u.disabled ? 'Mở khóa' : 'Khóa'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
