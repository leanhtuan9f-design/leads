import React, { useCallback, useEffect, useState } from 'react';
import { apiJson, AdminUserRow } from '../auth/types';
import { COUNTRIES } from '../data/countries';

type GroupKey = 'ALL' | 'BASIC' | 'ADVANCED' | 'NONE' | 'TRIAL' | 'ADMIN';
const GROUPS: { key: GroupKey; label: string; badge: string }[] = [
  { key: 'ALL', label: 'Tất cả', badge: '' },
  { key: 'ADVANCED', label: 'Nâng cao', badge: 'bg-purple-500/15 text-purple-200 border-purple-500/40' },
  { key: 'BASIC', label: 'Căn bản', badge: 'bg-blue-500/15 text-blue-200 border-blue-500/40' },
  { key: 'NONE', label: 'Chưa có gói', badge: 'bg-slate-500/15 text-slate-300 border-slate-600' },
  { key: 'TRIAL', label: 'Dùng thử', badge: 'bg-amber-500/15 text-amber-200 border-amber-500/40' },
  { key: 'ADMIN', label: 'Admin', badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40' }
];
const groupOf = (u: AdminUserRow): GroupKey => u.role === 'admin' ? 'ADMIN' : u.role === 'trial' ? 'TRIAL' : u.plan ?? 'NONE';
const lim = (n?: number) => (n ? String(n) : '∞');
// Chọn quốc gia bằng tick; nước đã khoá nhưng không có trong danh sách chuẩn vẫn hiện để không bị mất
const CountryPicker: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
  const all = [...COUNTRIES, ...value.filter(c => !(COUNTRIES as readonly string[]).includes(c))];
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter(x => x !== c) : [...value, c]);
  return (
    <div className="mt-1 grid max-h-36 grid-cols-2 md:grid-cols-4 gap-1 overflow-y-auto rounded border border-slate-700 bg-slate-950/60 p-2">
      {all.map(c => <label key={c} className="flex cursor-pointer items-center gap-1.5 text-slate-300"><input type="checkbox" checked={value.includes(c)} onChange={() => toggle(c)} />{c}</label>)}
    </div>
  );
};
const day = (t?: number | null) => (t ? new Date(t).toLocaleDateString('vi-VN') : '—');

// Panel chỉnh sửa theo gói: đổi gói/chu kỳ, giới hạn riêng (trống = theo gói, 0 = không giới hạn), quốc gia, hạn mức ngày.
const Edit: React.FC<{ u: AdminUserRow; input: string; patch: (id: number, body: Record<string, unknown>) => Promise<void>; setError: (m: string) => void; onClose: () => void }> = ({ u, input, patch, setError, onClose }) => {
  const [plan, setPlan] = useState<string>(u.plan ?? 'NONE');
  const [cycle, setCycle] = useState<string>(u.billingCycle ?? 'MONTHLY');
  const opt = (custom: boolean | undefined, v?: number) => (custom ? String(v ?? 0) : '');
  const [mc, setMc] = useState(opt(u.maxCountriesCustom, u.maxCountries));
  const [cs, setCs] = useState(opt(u.maxConcurrentCustom, u.maxConcurrentSearches));
  const [ds, setDs] = useState(opt(u.dailySearchesCustom, u.dailySearches));
  const [countries, setCountries] = useState<string[]>(u.countries || []);
  const [dn, setDn] = useState(String(u.dailyNew));
  const [dr, setDr] = useState(String(u.dailyRefresh));
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const save = async () => {
    const body: Record<string, unknown> = { dailyNew: Number(dn), dailyRefresh: Number(dr) };
    if ((u.role === 'user' && plan !== (u.plan ?? 'NONE')) || (u.role === 'user' && plan !== 'NONE' && cycle !== u.billingCycle)) { body.plan = plan === 'NONE' ? null : plan; body.billingCycle = cycle; }
    const hasPlan = plan !== 'NONE' && u.role === 'user';
    if (hasPlan && plan === u.plan) { // đổi gói sẽ xoá ghi đè nên chỉ gửi khi giữ nguyên gói
      body.maxCountries = num(mc); body.maxConcurrentSearches = num(cs); body.dailySearches = num(ds);
      if (countries.length || (u.countries || []).length) body.countries = countries;
    }
    if (needsCountry) {
      if (!countries.length) { setError('Gói Căn bản cần chọn ít nhất 1 quốc gia'); return; }
      body.countries = countries;
    }
    const bad = ['maxCountries', 'maxConcurrentSearches', 'dailySearches'].some(k => k in body && body[k] !== null && !(Number.isInteger(body[k]) && (body[k] as number) >= 0));
    if (bad || !Number.isInteger(body.dailyNew) || !Number.isInteger(body.dailyRefresh)) { setError('Giá trị không hợp lệ'); return; }
    await patch(u.id, body);
    onClose();
  };
  const changed = u.role === 'user' && plan !== (u.plan ?? 'NONE');
  const needsCountry = changed && plan === 'BASIC'; // nâng/đổi tay sang Căn bản phải chọn nước (server kiểm tra theo cấu hình gói)
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-900/60 text-slate-400">
      {u.role === 'user' && <>
        <label>Gói
          <select value={plan} onChange={e => setPlan(e.target.value)} className={`${input} w-full mt-1`}>
            <option value="NONE">Chưa có gói</option><option value="BASIC">Căn bản</option><option value="ADVANCED">Nâng cao</option>
          </select>
        </label>
        <label>Chu kỳ
          <select value={cycle} disabled={plan === 'NONE'} onChange={e => setCycle(e.target.value)} className={`${input} w-full mt-1`}>
            <option value="MONTHLY">Tháng</option><option value="ANNUAL">Năm</option>
          </select>
        </label>
      </>}
      <label>Địa điểm mới/ngày<input type="number" min={0} value={dn} onChange={e => setDn(e.target.value)} className={`${input} w-full mt-1`} /></label>
      <label>Làm mới/ngày<input type="number" min={0} value={dr} onChange={e => setDr(e.target.value)} className={`${input} w-full mt-1`} /></label>
      {u.plan && !changed && <>
        <label>Số quốc gia tối đa <span className="text-slate-500">(gói: {lim(u.planMaxCountries)})</span>
          <input type="number" min={0} max={300} placeholder="theo gói" value={mc} onChange={e => setMc(e.target.value)} className={`${input} w-full mt-1`} /></label>
        <label>Search cùng lúc <span className="text-slate-500">(gói: {lim(u.planMaxConcurrentSearches)})</span>
          <input type="number" min={0} placeholder="theo gói" value={cs} onChange={e => setCs(e.target.value)} className={`${input} w-full mt-1`} /></label>
        <label>Lượt search/ngày <span className="text-slate-500">(gói: {lim(u.planDailySearches)})</span>
          <input type="number" min={0} placeholder="theo gói" value={ds} onChange={e => setDs(e.target.value)} className={`${input} w-full mt-1`} /></label>
        <div className="col-span-2 md:col-span-4">Quốc gia được tìm <span className="text-slate-500">({countries.length} đã chọn)</span>
          <CountryPicker value={countries} onChange={setCountries} /></div>
      </>}
      {needsCountry && <div className="col-span-2 md:col-span-4">Quốc gia được dùng <span className="text-amber-300">(bắt buộc với gói Căn bản)</span> <span className="text-slate-500">({countries.length} đã chọn)</span>
        <CountryPicker value={countries} onChange={setCountries} /></div>}
      {changed && <p className="col-span-2 md:col-span-4 text-amber-300">Đổi gói sẽ xoá giới hạn riêng và quốc gia đã khoá, đặt lại hạn mức ngày theo gói mới. Lưu rồi mở lại để chỉnh giới hạn riêng.</p>}
      <div className="col-span-2 md:col-span-4 flex gap-2">
        <button onClick={save} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md">Lưu</button>
        <button onClick={() => onClose()} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md">Hủy</button>
      </div>
    </div>
  );
};

export const AdminUsersView: React.FC<{ currentUserId: number }> = ({ currentUserId }) => {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formCountries, setFormCountries] = useState<string[]>([]);
  const [form, setForm] = useState({ email: '', password: '', plan: 'BASIC', billingCycle: 'MONTHLY', role: 'user' });
  const [filter, setFilter] = useState<GroupKey>('ALL');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const r = await apiJson<{ users: AdminUserRow[] }>('/admin/users');
      setUsers(r.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải danh sách');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea'); // trình duyệt không cho clipboard API (http / quyền)
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  };

  const copyCreds = async () => {
    if (!creds) return;
    await copyText(`Đăng nhập: ${window.location.origin}\nEmail: ${creds.email}\nMật khẩu: ${creds.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Mật khẩu chỉ lưu dạng băm nên không sao chép lại được; trong danh sách chỉ sao chép link + email
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copyRow = async (u: AdminUserRow) => {
    await copyText(`Đăng nhập: ${window.location.origin}\nEmail: ${u.email}`);
    setCopiedId(u.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const remove = async (ids: number[]) => {
    const names = users.filter(u => ids.includes(u.id)).map(u => u.email);
    const list = names.slice(0, 5).join('\n') + (names.length > 5 ? `\n… và ${names.length - 5} tài khoản khác` : '');
    if (!window.confirm(`Xóa vĩnh viễn ${ids.length} tài khoản?\n${list}\n\nPhiên đăng nhập, hạn mức, gói và dữ liệu đã lưu của họ sẽ bị xóa. Không thể hoàn tác.`)) return;
    setError(''); setNotice(''); setCreds(null);
    try {
      const r = await apiJson<{ deleted: number }>('/admin/users/delete', 'POST', { ids });
      setNotice(`Đã xóa ${r.deleted} tài khoản.`);
      setSelected(new Set());
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi');
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice(''); setCreds(null);
    if (form.role === 'user' && form.plan === 'BASIC' && !formCountries.length) { setError('Gói Căn bản cần chọn ít nhất 1 quốc gia'); return; }
    try {
      const r = await apiJson<{ email: string; password: string }>('/admin/users', 'POST', {
        email: form.email, password: form.password || undefined,
        role: form.role, ...(form.role === 'user' && form.plan !== 'NONE' ? { plan: form.plan, billingCycle: form.billingCycle, ...(form.plan === 'BASIC' ? { countries: formCountries } : {}) } : {})
      });
      setNotice(`Đã tạo tài khoản ${r.email}. Mật khẩu chỉ hiện một lần — hãy sao chép gửi cho người dùng.`);
      setCreds({ email: r.email, password: r.password });
      setForm({ ...form, email: '', password: '' }); setFormCountries([]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi');
    }
  };

  const patch = async (id: number, body: Record<string, unknown>): Promise<void> => {
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

  const input = 'bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500';

  const counts = users.reduce<Record<string, number>>((m, u) => { const g = groupOf(u); m[g] = (m[g] || 0) + 1; m.ALL = (m.ALL || 0) + 1; return m; }, {});
  const q = query.trim().toLowerCase();
  const shown = users.filter(u => (filter === 'ALL' || groupOf(u) === filter) && (!q || u.email.toLowerCase().includes(q)));
  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectable = shown.filter(u => u.id !== currentUserId);

  return (
    <div className="space-y-5 text-xs">
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">Tạo tài khoản mới</h2>
          <button type="button" onClick={() => setCreating(v => !v)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md">{creating ? 'Thu gọn' : '+ Tạo tài khoản'}</button>
        </div>
        {creating && (
          <form onSubmit={create} className="mt-3 flex flex-wrap items-end gap-2" title="Hạn mức ngày và giới hạn search lấy theo cấu hình gói; tài khoản gán tay không qua thanh toán.">
            <label className="text-slate-400 flex-1 min-w-[12rem]">Email
              <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={`${input} w-full mt-1`} />
            </label>
            <label className="text-slate-400 w-44">Mật khẩu (trống = tự sinh)
              <input type="text" minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={`${input} w-full mt-1`} />
            </label>
            <label className="text-slate-400">Quyền
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={`${input} block mt-1`}>
                <option value="user">Người dùng</option><option value="admin">Admin</option>
              </select>
            </label>
            {form.role === 'user' && <>
              <label className="text-slate-400">Gói
                <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} className={`${input} block mt-1`}>
                  <option value="BASIC">Căn bản</option><option value="ADVANCED">Nâng cao</option><option value="NONE">Chưa có gói</option>
                </select>
              </label>
              {form.plan !== 'NONE' && <label className="text-slate-400">Chu kỳ
                <select value={form.billingCycle} onChange={e => setForm({ ...form, billingCycle: e.target.value })} className={`${input} block mt-1`}>
                  <option value="MONTHLY">Tháng</option><option value="ANNUAL">Năm</option>
                </select>
              </label>}
            </>}
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md">Tạo</button>
            {form.role === 'user' && form.plan === 'BASIC' && <div className="basis-full text-slate-400">Quốc gia được dùng <span className="text-amber-300">(bắt buộc)</span> <span className="text-slate-500">({formCountries.length} đã chọn)</span>
              <CountryPicker value={formCountries} onChange={setFormCountries} /></div>}
          </form>
        )}
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

      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map(g => (
          <button key={g.key} onClick={() => setFilter(g.key)} className={`px-3 py-1.5 rounded-md border ${filter === g.key ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'}`}>
            {g.label} <span className="font-mono opacity-80">{counts[g.key] || 0}</span>
          </button>
        ))}
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm email…" className={`${input} ml-auto w-48`} />
      </div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-2.5 bg-red-500/10 border border-red-500/40 rounded text-red-100">
          <span>Đã chọn {selected.size} tài khoản</span>
          <button onClick={() => remove([...selected])} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-md">Xóa đã chọn</button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md">Bỏ chọn</button>
        </div>
      )}
      <p className="text-slate-500">∞ = không giới hạn. Mật khẩu chỉ lưu dạng băm nên không xem lại được; cần mật khẩu mới thì bấm "Đặt lại MK" rồi sao chép thông tin hiện ra.</p>
      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="p-2.5 w-8"><input type="checkbox" aria-label="Chọn tất cả đang hiện" checked={selectable.length > 0 && selectable.every(u => selected.has(u.id))} onChange={e => setSelected(e.target.checked ? new Set(selectable.map(u => u.id)) : new Set())} /></th>
              <th className="p-2.5">Email</th><th className="p-2.5">Gói</th><th className="p-2.5">Quốc gia</th>
              <th className="p-2.5">Search hôm nay</th><th className="p-2.5">Cùng lúc</th>
              <th className="p-2.5">Địa điểm mới</th><th className="p-2.5">Làm mới</th><th className="p-2.5">Trạng thái</th><th className="p-2.5">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(u => {
              const g = GROUPS.find(x => x.key === groupOf(u))!;
              return (
                <React.Fragment key={u.id}>
                  <tr className="border-t border-slate-800 text-slate-200">
                    <td className="p-2.5">{u.id !== currentUserId && <input type="checkbox" aria-label={`Chọn ${u.email}`} checked={selected.has(u.id)} onChange={() => toggle(u.id)} />}</td>
                    <td className="p-2.5 break-all">{u.email}{u.id === currentUserId && <span className="text-slate-500"> (bạn)</span>}</td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded border ${g.badge}`}>{g.label}</span>
                      {u.plan && <span className="text-slate-500"> {u.billingCycle === 'ANNUAL' ? 'năm' : 'tháng'} · từ {day(u.effectiveFrom)}{u.effectiveUntil ? ` · đến ${day(u.effectiveUntil)}` : ' · không hết hạn'}{u.manualPlan ? ' · gán tay' : ''}</span>}
                    </td>
                    <td className="p-2.5">{u.plan ? (u.maxCountries ? <>{u.countries?.length ? u.countries.join(', ') : <span className="text-amber-300">chưa chọn nước</span>} <span className="text-slate-500">(tối đa {u.maxCountries}{u.maxCountriesCustom ? ', tùy chỉnh' : ''})</span></> : <>mọi nước{u.maxCountriesCustom ? <span className="text-slate-500"> (tùy chỉnh)</span> : null}</>) : <span className="text-slate-500">—</span>}</td>
                    <td className="p-2.5 font-mono">{u.plan ? <>{u.searchUsed ?? 0} / {lim(u.dailySearches)}{u.dailySearchesCustom && <span className="text-slate-500"> *</span>}</> : <span className="text-slate-500">—</span>}</td>
                    <td className="p-2.5 font-mono">{u.plan ? <>{lim(u.maxConcurrentSearches)}{u.maxConcurrentCustom && <span className="text-slate-500"> *</span>}</> : <span className="text-slate-500">—</span>}</td>
                    <td className="p-2.5 font-mono">{u.newUsed} / {u.dailyNew}</td>
                    <td className="p-2.5 font-mono">{u.refreshUsed} / {u.dailyRefresh}</td>
                    <td className="p-2.5">{u.disabled ? <span className="text-red-300">Đã khóa</span> : <span className="text-emerald-300">Hoạt động</span>}</td>
                    <td className="p-2.5 space-x-2 whitespace-nowrap">
                      <button onClick={() => setEditing(editing === u.id ? null : u.id)} className="text-blue-400 hover:text-blue-300">{editing === u.id ? 'Đóng' : 'Chỉnh sửa'}</button>
                      <button onClick={() => copyRow(u)} className="text-emerald-300 hover:text-emerald-200">{copiedId === u.id ? '✓ Đã sao chép' : 'Sao chép TT'}</button>
                      <button onClick={() => { if (window.confirm(`Đặt lại mật khẩu cho ${u.email}?`)) patch(u.id, { resetPassword: true }); }} className="text-amber-300 hover:text-amber-200">Đặt lại MK</button>
                      {u.id !== currentUserId && (
                        <button onClick={() => patch(u.id, { disabled: !u.disabled })} className={u.disabled ? 'text-emerald-300 hover:text-emerald-200' : 'text-red-300 hover:text-red-200'}>
                          {u.disabled ? 'Mở khóa' : 'Khóa'}
                        </button>
                      )}
                      {u.id !== currentUserId && <button onClick={() => remove([u.id])} className="text-red-400 hover:text-red-300">Xóa</button>}
                    </td>
                  </tr>
                  {editing === u.id && <tr><td colSpan={10} className="p-0"><Edit u={u} input={input} patch={patch} setError={setError} onClose={() => setEditing(null)} /></td></tr>}
                </React.Fragment>
              );
            })}
            {!shown.length && <tr><td colSpan={10} className="p-4 text-center text-slate-500">Không có tài khoản</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-slate-500">* giới hạn riêng của người dùng, khác cấu hình gói.</p>
    </div>
  );
};
