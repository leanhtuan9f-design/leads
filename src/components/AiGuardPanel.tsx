import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../auth/types';

interface AccountQuota { account: string; label: string; pct: number; reset: number }
interface GuardView {
  outage: { type: 'service' | 'quota'; since: number; nextCheck: number; error: string; checks: number; probeError: string | null } | null;
  quota: { enabled: boolean; threshold: number | null; lastCheckAt: number | null; nextCheckAt: number | null; error: string | null;
    reading: { pct: number; reset: number; accounts: AccountQuota[]; at: number } | null };
  settings: { enabled: boolean; url: string; threshold: number; hasPassword: boolean };
  model: string | null;
  router9: boolean;
}

const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500';
const btnCls = 'px-3 py-1.5 rounded border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50';
const when = (t?: number | null) => (t ? new Date(t).toLocaleString('vi-VN') : '—');

// Trạng thái cầu chì AI (9router): dừng khi lỗi dịch vụ / hết quota tuần, kiểm tra lại, bỏ dừng, cấu hình đọc quota
export const AiGuardPanel: React.FC = () => {
  const [v, setV] = useState<GuardView | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [url, setUrl] = useState('');
  const [password, setPassword] = useState('');
  const [threshold, setThreshold] = useState('95');
  const [filled, setFilled] = useState(false);

  const load = useCallback(async (fill: boolean) => {
    try {
      const g = await apiJson<GuardView>('/admin/ai-guard');
      setV(g);
      if (fill) { setUrl(g.settings.url); setThreshold(String(g.settings.threshold)); setFilled(true); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Không tải được trạng thái AI.' }); }
  }, []);
  useEffect(() => {
    void load(true);
    const t = window.setInterval(() => { if (!document.hidden) void load(false); }, 10000);
    return () => window.clearInterval(t);
  }, [load]);

  const run = async (name: string, fn: () => Promise<GuardView>, done: string) => {
    setBusy(name); setMsg(null);
    try { setV(await fn()); setMsg({ ok: true, text: done }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Thao tác thất bại.' }); } finally { setBusy(''); }
  };

  if (!v) return <div className="mt-3 text-slate-400">{msg ? msg.text : 'Đang tải trạng thái AI...'}</div>;
  const { outage, quota } = v;
  const r = quota.reading;
  return (
    <div className="space-y-2.5 mt-3 pt-3 border-t border-slate-800">
      <div className="font-semibold text-white">Trạng thái AI (9router)</div>
      {!v.router9 ? (
        <div className="rounded border border-slate-600 bg-slate-800/60 text-slate-300 p-2.5">
          Kết nối AI hiện tại{v.model ? ` (${v.model})` : ''} không gọi qua 9router, nên cơ chế tự dừng khi AI lỗi và kiểm tra quota <b>không áp dụng</b>. Lỗi AI được xử lý như thường.
        </div>
      ) : null}
      {outage ? (
        <div className="rounded border border-amber-500/60 bg-amber-500/10 text-amber-200 p-2.5 space-y-1">
          <div><b>AI đang tạm dừng</b> — không gọi AI cho đến khi hoạt động lại.</div>
          {outage.type === 'service' ? (
            <>
              <div>Lỗi dịch vụ AI từ {when(outage.since)}: {outage.error}{v.model ? ` [${v.model}]` : ''}</div>
              <div>Lần gọi thử tiếp theo{v.model ? ` (${v.model})` : ''}: {when(outage.nextCheck)}.{outage.probeError ? ` Lần thử trước vẫn lỗi: ${outage.probeError}` : ''}</div>
            </>
          ) : (
            <>
              <div>{outage.error}</div>
              {r ? <div>Giờ reset quota: {when(r.reset)}. Lần đọc lại tiếp theo: {when(outage.nextCheck)}; dưới ngưỡng thì tự chạy lại.</div> : null}
            </>
          )}
        </div>
      ) : (
        <div className="rounded border border-emerald-600/50 bg-emerald-500/10 text-emerald-200 p-2.5">
          AI hoạt động bình thường. Khi AI lỗi dịch vụ (5xx, 429, 401/402/403, timeout), hệ thống tự dừng gọi AI và cứ 30 phút gọi thử lại một lần.
        </div>
      )}
      <div className="flex gap-2">
        <button className={btnCls} disabled={Boolean(busy)} onClick={() => run('check', () => apiJson<GuardView>('/admin/ai-guard/check', 'POST'), 'Đã kiểm tra lại.')}>{busy === 'check' ? 'Đang kiểm tra...' : 'Kiểm tra lại ngay'}</button>
        {outage ? <button className={btnCls} disabled={Boolean(busy)} onClick={() => run('resume', () => apiJson<GuardView>('/admin/ai-guard/resume', 'POST'), 'Đã bỏ dừng.')}>Bỏ dừng thủ công</button> : null}
      </div>
      {quota.enabled ? (
        <div className="space-y-1">
          <div>Quota Antigravity: <b>{r ? `${r.pct}%` : '—'}</b>{r ? ` (đọc lúc ${when(r.at)})` : ' (chưa đọc được)'} · kiểm tra tiếp: {when(quota.nextCheckAt)}</div>
          {r ? (
            <>
              <div className="text-slate-400">Chỉ dừng khi <b>tất cả {r.accounts.length} tài khoản</b> đã dùng từ {quota.threshold}% trở lên. Thấp nhất hiện tại {r.pct}% · reset sớm nhất {when(r.reset)}.</div>
              <table className="w-full text-left"><thead className="text-slate-500"><tr><th className="pr-3 font-medium">Tài khoản</th><th className="pr-3 font-medium">Hạn mức</th><th className="pr-3 font-medium">Đã dùng</th><th className="font-medium">Reset</th></tr></thead>
                <tbody>{r.accounts.map((a) => (
                  <tr key={a.account} className="border-t border-slate-800"><td className="pr-3 break-all">{a.account}</td><td className="pr-3">{a.label}</td>
                    <td className={`pr-3 font-medium ${quota.threshold !== null && a.pct >= quota.threshold ? 'text-red-400' : 'text-emerald-400'}`}>{a.pct}%</td><td>{when(a.reset)}</td></tr>))}</tbody></table>
            </>
          ) : null}
          {quota.error ? <div className="text-red-400">Lỗi đọc quota: {quota.error}</div> : null}
        </div>
      ) : <div className="text-slate-400">Chưa bật kiểm tra quota. Nhập Dashboard URL và mật khẩu bên dưới để mỗi ngày đọc hạn mức tuần và tự dừng khi tất cả tài khoản đạt ngưỡng.</div>}
      <details open={!quota.enabled} className="rounded border border-slate-700 p-2.5">
        <summary className="cursor-pointer text-white">Cài đặt kiểm tra quota (9router dashboard)</summary>
        <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void run('save', () => apiJson<GuardView>('/admin/ai-guard/settings', 'PUT', { url, password, threshold: Number(threshold) }), 'Đã lưu và kiểm tra quota.').then(() => setPassword('')); }}>
          <label className="block"><span className="text-slate-400">Dashboard URL</span>
            <input className={inputCls} type="url" required placeholder="http://127.0.0.1:20128" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!filled} /></label>
          <label className="block"><span className="text-slate-400">Mật khẩu</span>
            <input className={inputCls} type="password" autoComplete="new-password" required={!v.settings.hasPassword} placeholder={v.settings.hasPassword ? 'Đã lưu — để trống để giữ nguyên' : 'Mật khẩu dashboard'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <label className="block"><span className="text-slate-400">Ngưỡng dừng (%)</span>
            <input className={inputCls} type="number" min={50} max={100} required value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
          <button type="submit" className={btnCls} disabled={Boolean(busy) || !filled}>{busy === 'save' ? 'Đang lưu...' : 'Lưu và kiểm tra'}</button>
        </form>
      </details>
      {msg ? <div className={msg.ok ? 'text-emerald-400' : 'text-red-400'}>{msg.text}</div> : null}
    </div>
  );
};
