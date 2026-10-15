import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../auth/types';
import { CITIES } from '../data/cities';

interface Stats {
  total: number; pending: number; running: number; done: number; empty: number; error: number;
  saturated: number; unsplit: number; splitting: number; retried: number;
  found: number; fromCache: number; fromLive: number; uniquePlaces: number; withPhone: number; withWebsite: number; withEmail: number;
}
interface Task {
  id: number; product: string; country: string; maxResults: number; status: 'running' | 'done' | 'stopped'; by: string;
  keywords: string[]; cities: string[]; buyerTypes: { name: string; keyword: string }[]; proxies: number;
  createdAt: number; finishedAt: number | null; note: string; stats: Stats;
  current: { keyword: string; city: string; startedAt: number } | null;
  burstN: number; restMin: number; restUntil: number;
}
interface Run {
  id: number; keyword: string; city: string; status: 'pending' | 'running' | 'done' | 'empty' | 'error';
  count: number; cache: number; live: number; startedAt: number | null; finishedAt: number | null; message: string;
  level: number; saturated: boolean; attempts: number; splitState: string;
}

const fmt = (t: number | null) => (t ? new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const TASK_STATUS: Record<string, [string, string]> = {
  running: ['Đang chạy tự động', 'bg-emerald-500/20 text-emerald-300'],
  done: ['Đã xong', 'bg-blue-500/20 text-blue-300'],
  stopped: ['Đã dừng', 'bg-amber-500/20 text-amber-300']
};
const RUN_STATUS: Record<string, [string, string]> = {
  pending: ['Chờ', 'text-slate-400'],
  running: ['Đang cào', 'text-emerald-300'],
  done: ['Xong', 'text-blue-300'],
  empty: ['Không có kết quả', 'text-amber-300'],
  error: ['Lỗi', 'text-red-300']
};

export const AutoTasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxPairs, setMaxPairs] = useState(80);
  const [gapSec, setGapSec] = useState(20);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [product, setProduct] = useState('');
  const [country, setCountry] = useState('');
  const [proxies, setProxies] = useState('');
  const [cities, setCities] = useState('');
  const [burstN, setBurstN] = useState<string | null>(null); // null = chưa chỉnh → máy chủ tự chọn theo có/không proxy
  const [restMin, setRestMin] = useState<string | null>(null);
  const noProxy = proxies.trim() === '';

  const [openId, setOpenId] = useState<number | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await apiJson<{ tasks: Task[]; aiEnabled: boolean; maxPairs: number; gapSec: number }>('/admin/auto');
      setTasks(r.tasks); setAiEnabled(r.aiEnabled); setMaxPairs(r.maxPairs); setGapSec(r.gapSec);
      if (openId !== null) {
        const d = await apiJson<{ runs: Run[] }>(`/admin/auto/${openId}`);
        setRuns(d.runs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    }
  }, [openId]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await apiJson<{ id: number }>('/admin/auto', 'POST', { product, country, proxies, cities, ...(burstN !== null || restMin !== null ? { burstN: burstN ?? (noProxy ? '5' : '0'), restMin: restMin ?? (noProxy ? '10' : '0') } : {}) });
      setProduct(''); setCities('');
      setOpenId(r.id); setRuns([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được tác vụ');
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: number, what: 'stop' | 'resume' | 'delete') => {
    if (what === 'delete' && !window.confirm('Xóa tác vụ và báo cáo của nó? (Dữ liệu đã cào vẫn nằm trong kho.)')) return;
    try {
      if (what === 'delete') { await apiJson(`/admin/auto/${id}`, 'DELETE'); if (openId === id) setOpenId(null); }
      else await apiJson(`/admin/auto/${id}/${what}`, 'POST', {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác thất bại');
    }
  };

  const toggle = async (id: number) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setRuns([]);
    try { setRuns((await apiJson<{ runs: Run[] }>(`/admin/auto/${id}`)).runs); } catch { /* làm mới sau 5s */ }
  };

  const inputCls = 'w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none';
  const card = 'bg-slate-950 border border-slate-800 rounded-lg p-4';
  const open = tasks.find(t => t.id === openId);

  return (
    <section className={card}>
      <h3 className="font-semibold text-white mb-1">Tác vụ tự động (sản phẩm → quốc gia → từ khóa × thành phố)</h3>
      <p className="text-[11px] text-slate-500 mb-3">
        Nhập sản phẩm và quốc gia, hệ thống tự nhờ AI chọn từ khóa + loại khách hàng, ghép với thành phố của nước đó rồi cào lần lượt khi máy rảnh
        (ưu tiên người dùng trước, nghỉ {gapSec}s giữa hai lần cào, tối đa {maxPairs} cặp ban đầu/tác vụ). Để không sót: mỗi cặp cào sâu nhất; cặp nào chạm trần Google (≥100 lead) tự được tách thành quận/phường rồi cào tiếp; cặp lỗi/trống được thử lại; gián đoạn (khởi động lại) thì chạy lại cặp dở. Không tính hạn mức của ai; dữ liệu vào kho chung nên người dùng tìm cùng từ khóa sẽ có sẵn.
      </p>

      <form onSubmit={create} className="space-y-2.5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-4">
            <label className="block text-[11px] text-slate-400 mb-1">Sản phẩm</label>
            <input value={product} onChange={e => setProduct(e.target.value)} maxLength={300} placeholder="vd: cà phê rang xay, hạt điều" className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">Quốc gia</label>
            <input value={country} onChange={e => setCountry(e.target.value)} list="auto-country-list" placeholder="vd: Japan" autoComplete="off" className={inputCls} />
            <datalist id="auto-country-list">{Object.keys(CITIES).map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="md:col-span-5">
            <label className="block text-[11px] text-slate-400 mb-1">Proxy (mỗi dòng một proxy, thêm một hoặc nhiều; tối đa 10)</label>
            <textarea value={proxies} onChange={e => setProxies(e.target.value)} rows={2} spellCheck={false} autoComplete="off"
              placeholder={'http://user:pass@host:port\nsocks5://user:pass@host:port'} className={`${inputCls} font-mono`} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
          <div className="md:col-span-5">
            <label className="block text-[11px] text-slate-400 mb-1">Thành phố (tùy chọn — để trống = dùng danh sách có sẵn của nước đó; nhiều thành phố cách nhau bằng dấu phẩy)</label>
            <input value={cities} onChange={e => setCities(e.target.value)} placeholder="vd: Tokyo, Osaka" className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1" title="Chống bị Google chặn: cào đủ N cặp thì nghỉ M phút. 0 = không nghỉ.">Nghỉ: sau (cặp) / phút</label>
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} max={100} value={burstN ?? (noProxy ? '5' : '0')} onChange={e => setBurstN(e.target.value)} className={`${inputCls} text-center`} aria-label="Số cặp cào trước khi nghỉ" />
              <span className="text-slate-500">/</span>
              <input type="number" min={0} max={240} value={restMin ?? (noProxy ? '10' : '0')} onChange={e => setRestMin(e.target.value)} className={`${inputCls} text-center`} aria-label="Số phút nghỉ" />
            </div>
          </div>
          <button type="submit" disabled={busy || !product.trim() || !country.trim() || !aiEnabled}
            className="md:col-span-4 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-lg">
            {busy ? 'AI đang chọn từ khóa…' : 'Tạo tác vụ & chạy tự động'}
          </button>
        </div>
        {!aiEnabled && <div className="text-amber-300">AI chưa được cấu hình (menu tài khoản → Cấu hình AI).</div>}
        {noProxy && <div className="text-[11px] text-slate-500">Không nhập proxy = cào bằng IP máy chủ (dễ bị Google chặn khi chạy nhiều). Mặc định nghỉ 10 phút sau mỗi 5 cặp; chỉnh hai ô “Nghỉ” nếu muốn (0 = không nghỉ).</div>}
        {error && <div className="p-2 bg-red-500/10 border border-red-500/40 rounded text-red-200">{error}</div>}
      </form>

      <div className="mt-4 space-y-2">
        {tasks.length === 0 && <div className="text-slate-500">Chưa có tác vụ nào.</div>}
        {tasks.map(t => {
          const s = t.stats;
          const finished = s.done + s.empty + s.error;
          const pct = s.total ? Math.round((finished / s.total) * 100) : 0;
          const [label, cls] = TASK_STATUS[t.status] || [t.status, ''];
          return (
            <div key={t.id} className="border border-slate-800 rounded-lg bg-slate-900/40">
              <div className="p-3 flex flex-wrap items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{label}</span>
                <button type="button" onClick={() => toggle(t.id)} className="text-left hover:underline" title="Bấm để xem báo cáo">
                  <span className="text-slate-500 font-normal">Mặt hàng: </span><span className="text-white font-semibold">{t.product}</span>
                </button>
                <span><span className="text-slate-500">Quốc gia: </span><span className="text-white">{t.country}</span></span>
                <span className="text-slate-500">· {fmt(t.createdAt)}{t.proxies ? ` · ${t.proxies} proxy` : ' · IP máy chủ'}{t.burstN > 0 && t.restMin > 0 ? ` · nghỉ ${t.restMin}p/${t.burstN} cặp` : ''}</span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="font-mono text-slate-300">{finished}/{s.total} cặp ({pct}%)</span>
                  {t.status === 'running' && <button type="button" onClick={() => act(t.id, 'stop')} className="px-2 py-0.5 border border-amber-500/50 text-amber-300 hover:bg-amber-500/20 rounded">Dừng</button>}
                  {t.status === 'stopped' && s.pending > 0 && <button type="button" onClick={() => act(t.id, 'resume')} className="px-2 py-0.5 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20 rounded">Tiếp tục</button>}
                  <button type="button" onClick={() => act(t.id, 'delete')} className="px-2 py-0.5 border border-slate-700 text-slate-400 hover:text-red-300 rounded">Xóa</button>
                </span>
              </div>
              <div className="h-1 bg-slate-800 mx-3 rounded"><div className="h-1 bg-emerald-500 rounded" style={{ width: `${pct}%` }} /></div>
              {t.note && t.status !== 'running' && <div className="px-3 pt-2 text-[11px] text-amber-300">{t.note}</div>}
              {t.status === 'running' && (
                <div className="px-3 pt-2 text-[11px] text-emerald-300">
                  {t.restUntil > 0
                    ? `😴 Đang nghỉ chống bị chặn đến ${new Date(t.restUntil).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} (sau mỗi ${t.burstN} cặp nghỉ ${t.restMin} phút)`
                    : t.current
                    ? `⏳ Đang cào: “${t.current.keyword}” @ ${t.current.city} — ${Math.max(0, Math.round((Date.now() - t.current.startedAt) / 1000))}s (mỗi cặp thường mất 2–6 phút, kết quả hiện khi cặp xong)`
                    : `⏸ Đang chờ máy rảnh (ưu tiên lượt của người dùng, nghỉ ${gapSec}s giữa các cặp)`}
                </div>
              )}
              <div className="px-3 pb-3 pt-2 text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                <span>Lead khác nhau: <b className="text-white">{s.uniquePlaces}</b></span>
                <span>SĐT {s.withPhone}</span><span>Website {s.withWebsite}</span><span>Email {s.withEmail}</span>
                <span>Cào mới {s.fromLive} · Từ kho {s.fromCache}</span>
                {s.saturated > 0 && <span className="text-sky-300">Chạm trần Google {s.saturated} cặp → đã/đang tách khu nhỏ{s.splitting > 0 ? ` (chờ tách ${s.splitting})` : ''}</span>}
                {s.unsplit > 0 && <span className="text-amber-300">Chưa tách hết {s.unsplit} cặp (có thể còn sót)</span>}
                {s.retried > 0 && <span>Thử lại {s.retried} cặp</span>}
                {s.error > 0 && <span className="text-red-300">Lỗi {s.error} cặp</span>}
                {s.empty > 0 && <span className="text-amber-300">Trống {s.empty} cặp</span>}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="mt-4 p-3 border border-slate-700 rounded-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-white">Báo cáo — mặt hàng: {open.product} · quốc gia: {open.country}</h4>
            <a href={`/api/admin/auto/${open.id}/export.csv`} className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded">Tải toàn bộ lead (CSV)</a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            {([
              ['Cặp đã chạy', `${open.stats.done + open.stats.empty + open.stats.error}/${open.stats.total}`],
              ['Lead khác nhau', open.stats.uniquePlaces],
              ['Tổng lượt tìm thấy', open.stats.found],
              ['Lead / cặp (TB)', open.stats.done ? Math.round(open.stats.found / open.stats.done) : 0]
            ] as [string, React.ReactNode][]).map(([k, v]) => (
              <div key={k} className="p-2 bg-slate-900/70 border border-slate-800 rounded">
                <div className="text-slate-400">{k}</div><div className="text-base font-bold text-white font-mono">{v}</div>
              </div>
            ))}
          </div>
          <div className={`p-2 rounded border text-[11px] ${open.stats.unsplit > 0 || open.stats.error > 0 ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
            <b>Độ phủ:</b>{' '}
            {open.stats.saturated === 0 && open.stats.error === 0 && open.stats.unsplit === 0
              ? 'mọi cặp đã xong đều trả ít hơn 100 lead nên chưa chạm trần Google — coi như lấy trọn.'
              : `${open.stats.saturated} cặp chạm trần Google (≥100 lead) ${open.stats.unsplit ? `— ${open.stats.unsplit} cặp CHƯA tách hết (đạt trần số cặp/cấp sâu nhất hoặc AI lỗi) nên có thể còn sót` : 'đều đã được tách thành khu nhỏ'}${open.stats.error ? `; ${open.stats.error} cặp lỗi sau khi thử lại (thiếu dữ liệu)` : ''}.`}
          </div>
          <div className="text-[11px] text-slate-400 space-y-1">
            <div><b className="text-slate-300">Từ khóa AI chọn:</b> {open.keywords.join(' · ')}</div>
            {open.buyerTypes.length > 0 && <div><b className="text-slate-300">Loại khách hàng:</b> {open.buyerTypes.map(b => b.name).join(' · ')}</div>}
            <div><b className="text-slate-300">Thành phố ({open.cities.length}):</b> {open.cities.join(' · ')}</div>
            <div><b className="text-slate-300">Tạo bởi:</b> {open.by} · {open.finishedAt ? ` · kết thúc ${fmt(open.finishedAt)}` : ''}{open.note ? ` · ${open.note}` : ''}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr><th className="py-1 pr-3">Thành phố</th><th className="pr-3">Từ khóa</th><th className="pr-3">Trạng thái</th><th className="pr-3 text-right">Lead</th><th className="pr-3 text-right">Mới</th><th className="pr-3 text-right">Kho</th><th className="pr-3">Xong lúc</th><th>Ghi chú</th></tr>
              </thead>
              <tbody>
                {runs.map(r => {
                  const [label, cls] = RUN_STATUS[r.status] || [r.status, ''];
                  return (
                    <tr key={r.id} className="border-b border-slate-900">
                      <td className="py-1 pr-3 text-white" style={{ paddingLeft: r.level * 12 }}>{r.level > 0 ? '↳ ' : ''}{r.city}{r.saturated ? <span title="Chạm trần Google (≥100 lead)" className="ml-1 text-sky-300">●</span> : null}{r.attempts > 1 ? <span title={`Đã thử ${r.attempts} lần`} className="ml-1 text-slate-500">↻{r.attempts}</span> : null}</td>
                      <td className="pr-3 text-slate-300">{r.keyword}</td>
                      <td className={`pr-3 ${cls}`}>{label}</td>
                      <td className="pr-3 text-right font-mono">{r.count}</td>
                      <td className="pr-3 text-right font-mono">{r.live}</td>
                      <td className="pr-3 text-right font-mono">{r.cache}</td>
                      <td className="pr-3 text-slate-500">{fmt(r.finishedAt)}</td>
                      <td className="text-slate-500 max-w-[320px] truncate" title={r.message}>{r.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
