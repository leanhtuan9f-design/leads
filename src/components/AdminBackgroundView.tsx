import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, MailX, Phone, Search, X } from 'lucide-react';
import { apiJson } from '../auth/types';
import { AutoTasks } from './AutoTasks';
import { AutoPlan } from './AutoPlan';
import { AdminBuyerSegments } from './AdminBuyerSegments';
import { HelpButton } from './HelpButton';

interface JobRow {
  id: string;
  background: boolean;
  auto?: boolean;
  autoTask?: { id: number; product: string; country: string } | null;
  force: boolean;
  cacheOnly?: boolean;
  user: string | null;
  queries: string[];
  count: number;
  cache: number;
  live: number;
  proxies: number;
  createdAt: number;
  startedAt: number | null;
  detached: boolean;
  finishedAt?: number;
  status?: string;
  message?: string;
}

interface BackgroundInfo {
  now: number;
  running: JobRow | null;
  backgroundRunning?: JobRow[];
  workerCount?: number;
  scanEnabled?: boolean;
  scanIntervalMinutes?: number;
  queue: JobRow[];
  autoQueues: Record<'manual' | 'plan', { total: number; running: number; completed: number; next: { keyword: string; city: string; level: number; attempts: number; product: string; country: string; restUntil: number; waitReason: string }[] }>;
  autoQueue: { total: number; next: { keyword: string; city: string; level: number; attempts: number; product: string; country: string; restUntil: number; waitReason: string }[] };
  pending: { query: string; depth: number; withEmail: boolean; lang: string; proxies: number }[];
  bgDoneThisHour: number;
  bgPerHour: number;
  ttlDays: number;
  recent: JobRow[];
  ai: {
    enabled: boolean;
    model: string;
    dailyLimit: number;
    calls30d: number;
    ok30d: number;
    inputTokens30d: number;
    outputTokens30d: number;
    recent: { at: number; user: string | null; ok: boolean; input: number; output: number; items: number; message: string }[];
  };
  logTotal: number;
  logKeepDays: number;
  cache: { places: number; withEmail: number; withoutEmail: number; withPhone: number; queries: number; hits: number };
}

type CacheFilter = 'withEmail' | 'withoutEmail' | 'withPhone';
interface CacheRow {
  id: string; title: string; category: string; address: string; city: string; country: string;
  phone: string; website: string; email: string; rating: number; reviewsCount: number; googleMapsUrl: string; lastSeen: number;
}
interface CacheReportResponse { contact: CacheFilter; search: string; page: number; pageSize: number; total: number; rows: CacheRow[]; }

const fmtTime = (t: number | null | undefined) => (t ? new Date(t).toLocaleTimeString('vi-VN') : '—');
const fmtDateTime = (t: number | null | undefined) => (t ? new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}p ${s % 60}s` : `${s}s`;
};
const STATUS: Record<string, string> = { done: 'Xong', cancelled: 'Đã hủy', failed: 'Lỗi' };

const Kind: React.FC<{ j: JobRow }> = ({ j }) => (
  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${j.auto ? 'bg-emerald-500/20 text-emerald-300' : j.background ? 'bg-purple-500/20 text-purple-300' : j.cacheOnly ? 'bg-slate-500/20 text-slate-300' : 'bg-blue-500/20 text-blue-300'}`}>
    {j.auto ? 'Tác vụ tự động' : j.background ? 'Nền (cập nhật kho)' : j.cacheOnly ? 'Từ kho' : j.force ? 'Người dùng · cào mới' : 'Người dùng'}
  </span>
);

const QueueSection: React.FC<{ title: string; q: BackgroundInfo['autoQueues']['manual'] }> = ({ title, q }) => (
  <section className="bg-slate-950 border border-slate-800 rounded-lg p-4">
    <h3 className="font-semibold text-white mb-2">{title} ({q.total} cặp)</h3>
    <p className="text-[11px] text-slate-500 mb-2">Các cặp (từ khóa @ khu vực) của tác vụ đang chạy, theo thứ tự sẽ cào. Chạy khi máy rảnh, sau lượt người dùng.</p>
    {q.total === 0 ? (
      <div className="text-slate-500">Không có cặp nào đang chờ.</div>
    ) : (
      <>
        <ol className="space-y-1 list-decimal list-inside text-slate-300">
          {q.next.map((x, i) => (
            <li key={i}>
              <span className="text-white">{x.keyword}</span> @ {x.city}
              <span className="text-slate-500"> · {x.product} → {x.country}{x.level > 0 ? ' · khu nhỏ' : ''}{x.attempts > 1 ? ` · thử lại lần ${x.attempts}` : ''}</span>
            </li>
          ))}
        </ol>
        {q.total > q.next.length && <div className="mt-1 text-slate-500">… và {q.total - q.next.length} cặp nữa</div>}
        {q.next[0]?.restUntil > 0 && (
          <div className="mt-1 text-amber-300">
            {q.next[0].waitReason === 'window' ? '🕘 Đang ngoài giờ làm việc của nước đích — sẽ chạy lại lúc ' : '😴 Đang nghỉ chống bị chặn đến '}
            {new Date(q.next[0].restUntil).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} (giờ máy bạn)
          </div>
        )}
      </>
    )}
  </section>
);

export const AdminBackgroundView: React.FC<{ onOpenGuide?: (guideId: string) => void }> = ({ onOpenGuide }) => {
  const [bgTab, setBgTabRaw] = useState<'manual' | 'auto'>(() => { try { return localStorage.getItem('gmaps_bg_tab') === 'auto' ? 'auto' : 'manual'; } catch { return 'manual'; } });
  const setBgTab = (v: 'manual' | 'auto') => { setBgTabRaw(v); try { localStorage.setItem('gmaps_bg_tab', v); } catch { /* bỏ qua */ } };
  const [pairTab, setPairTabRaw] = useState<'pending' | 'running' | 'completed'>(() => {
    try {
      const saved = localStorage.getItem('gmaps_bg_pair_tab');
      return saved === 'running' || saved === 'completed' ? saved : 'pending';
    } catch { return 'pending'; }
  });
  const setPairTab = (v: 'pending' | 'running' | 'completed') => {
    setPairTabRaw(v);
    try { localStorage.setItem('gmaps_bg_pair_tab', v); } catch { /* bỏ qua */ }
  };
  const [info, setInfo] = useState<BackgroundInfo | null>(null);
  const [error, setError] = useState('');
  const [workerDraft, setWorkerDraft] = useState('');
  const [savingWorkers, setSavingWorkers] = useState(false);
  const [workerMessage, setWorkerMessage] = useState('');
  const workerDirty = useRef(false);
  const [scanEnabled, setScanEnabled] = useState(false);
  const [intervalDraft, setIntervalDraft] = useState('60');
  const configDirty = useRef(false);
  const [cacheFilter, setCacheFilter] = useState<CacheFilter | null>(null);
  const [cacheSearchInput, setCacheSearchInput] = useState('');
  const [cacheSearch, setCacheSearch] = useState('');
  const [cachePage, setCachePage] = useState(0);
  const [cacheReport, setCacheReport] = useState<CacheReportResponse | null>(null);
  const [cacheReportLoading, setCacheReportLoading] = useState(false);
  const [cacheReportError, setCacheReportError] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await apiJson<BackgroundInfo>('/admin/background');
      setInfo(next);
      if (!configDirty.current) {
        setWorkerDraft(String(next.workerCount || 1));
        setScanEnabled(Boolean(next.scanEnabled));
        setIntervalDraft(String(next.scanIntervalMinutes || 60));
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    }
  }, []);

  const saveWorkers = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWorkers(true);
    setWorkerMessage('');
    try {
      const result = await apiJson<{ workerCount: number; scanEnabled: boolean; scanIntervalMinutes: number }>('/admin/background/config', 'PUT', {
        workers: Number(workerDraft), enabled: scanEnabled, intervalMinutes: Number(intervalDraft),
      });
      workerDirty.current = false;
      configDirty.current = false;
      setWorkerDraft(String(result.workerCount));
      setScanEnabled(result.scanEnabled);
      setIntervalDraft(String(result.scanIntervalMinutes));
      setWorkerMessage('Đã lưu và áp dụng cho lượt chạy nền tiếp theo.');
      await load();
    } catch (e) {
      setWorkerMessage(e instanceof Error ? e.message : 'Không lưu được cấu hình');
    } finally {
      setSavingWorkers(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  const loadCacheReport = useCallback(async () => {
    if (!cacheFilter) return;
    setCacheReportLoading(true);
    setCacheReportError('');
    try {
      const qs = new URLSearchParams({ contact: cacheFilter, search: cacheSearch, page: String(cachePage), limit: '25' });
      setCacheReport(await apiJson<CacheReportResponse>(`/admin/cache/places?${qs.toString()}`));
    } catch (e) {
      setCacheReportError(e instanceof Error ? e.message : 'Không tải được báo cáo kho');
    } finally {
      setCacheReportLoading(false);
    }
  }, [cacheFilter, cachePage, cacheSearch]);

  useEffect(() => { loadCacheReport(); }, [loadCacheReport]);

  if (!info) return <div className="text-xs text-slate-400">{error ? `⚠️ ${error}` : 'Đang tải…'}</div>;

  // Tương thích với backend cũ trong lúc service chưa restart/deploy đồng bộ.
  const backgroundRunning = info.backgroundRunning || [];
  const workerCount = info.workerCount || 1;
  const queueKind = bgTab === 'manual' ? 'manual' : 'plan';
  const activeQueue = info.autoQueues[queueKind];

  const card = 'bg-slate-950 border border-slate-800 rounded-lg p-4';
  const stat = (label: string, value: React.ReactNode) => (
    <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-lg font-bold text-white font-mono tabular-nums">{value}</div>
    </div>
  );
  const openCacheReport = (filter: CacheFilter) => {
    setCacheFilter(filter);
    setCachePage(0);
    setCacheSearchInput('');
    setCacheSearch('');
  };
  const closeCacheReport = () => { setCacheFilter(null); setCacheReport(null); setCacheReportError(''); };
  const cacheReportTitle = cacheFilter === 'withEmail' ? 'Doanh nghiệp có Email' : cacheFilter === 'withPhone' ? 'Doanh nghiệp có SĐT' : 'Doanh nghiệp không có Email';
  const cacheTotalPages = cacheReport ? Math.max(1, Math.ceil(cacheReport.total / cacheReport.pageSize)) : 1;

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">Chạy ngầm{onOpenGuide && <HelpButton guideId="admin_background" onOpenGuide={onOpenGuide} />}</h2>
        <span className="text-[11px] text-slate-500">Tự làm mới mỗi 5 giây · {fmtTime(info.now)}</span>
      </div>
      {error && <div className="p-2 bg-amber-500/10 border border-amber-500/40 rounded text-amber-200">⚠️ {error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
        {stat('Đang chạy', `${(info.running ? 1 : 0) + backgroundRunning.length}/${workerCount + 1}`)}
        {stat('Hàng đợi người dùng', info.queue.length)}
        {stat('Cặp tự động đang chờ', info.autoQueue.total)}
        {stat('Chờ cập nhật kho cũ', info.pending.length)}
        {stat('Cập nhật kho giờ này', `${info.bgDoneThisHour}/${info.bgPerHour}`)}
        <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
          <div className="text-[11px] text-slate-400">Kho</div>
          <div className="text-lg font-bold text-white font-mono tabular-nums">{info.cache.places} điểm</div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button type="button" onClick={() => openCacheReport('withEmail')} className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1 text-left text-[10px] text-emerald-200 hover:border-emerald-400/70 hover:bg-emerald-500/20">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />Email</span>
              <span className="font-mono text-white">{info.cache.withEmail}</span>
            </button>
            <button type="button" onClick={() => openCacheReport('withPhone')} className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-1 text-left text-[10px] text-sky-200 hover:border-sky-400/70 hover:bg-sky-500/20">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />SĐT</span>
              <span className="font-mono text-white">{info.cache.withPhone}</span>
            </button>
            <button type="button" onClick={() => openCacheReport('withoutEmail')} className="rounded border border-slate-700 bg-slate-950/60 px-1.5 py-1 text-left text-[10px] text-slate-300 hover:border-slate-500 hover:bg-slate-800">
              <span className="flex items-center gap-1"><MailX className="h-3 w-3" />Không email</span>
              <span className="font-mono text-white">{info.cache.withoutEmail}</span>
            </button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        Dữ liệu trong kho quá {info.ttlDays} ngày sẽ được cào lại bằng tối đa {workerCount} luồng nền (tối đa {info.bgPerHour} truy vấn/giờ), không tính hạn mức của ai.
        Kho: {info.cache.queries} truy vấn, {info.cache.hits} lượt dùng lại.
      </p>

      <AdminBuyerSegments />

      {cacheFilter && (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-white">{cacheReportTitle}</h3>
              <p className="text-[11px] text-slate-500">Bấm các nhóm trong thẻ Kho để đổi báo cáo.</p>
            </div>
            <button type="button" onClick={closeCacheReport} className="flex items-center gap-1 rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-3.5 w-3.5" />Đóng</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setCachePage(0); setCacheSearch(cacheSearchInput.trim()); }} className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[17rem] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input value={cacheSearchInput} onChange={(e) => setCacheSearchInput(e.target.value)} placeholder="Lọc theo tên, ngành, địa chỉ, email…" className="w-full rounded border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none" />
            </div>
            <button type="submit" className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500">Lọc</button>
            {cacheReport && <span className="text-[11px] text-slate-400">{cacheReport.total.toLocaleString('vi-VN')} doanh nghiệp</span>}
          </form>
          {cacheReportError && <div className="mt-2 rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-200">{cacheReportError}</div>}
          {cacheReportLoading ? <div className="py-8 text-center text-slate-500">Đang tải báo cáo…</div> : cacheReport && (
            <>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[11px]">
                  <thead className="border-b border-slate-800 text-slate-400"><tr><th className="py-2 pr-3">Doanh nghiệp</th><th className="pr-3">Ngành</th><th className="pr-3">Địa chỉ</th><th className="pr-3">Liên hệ</th><th className="pr-3 text-right">Đánh giá</th><th>Cập nhật</th></tr></thead>
                  <tbody className="divide-y divide-slate-900">
                    {cacheReport.rows.map((row) => (
                      <tr key={row.id} className="align-top hover:bg-slate-900/60">
                        <td className="py-2 pr-3 font-medium text-white">{row.googleMapsUrl ? <a href={row.googleMapsUrl} target="_blank" rel="noreferrer" className="hover:text-cyan-300 hover:underline">{row.title || row.id}</a> : row.title || row.id}</td>
                        <td className="pr-3 text-slate-300">{row.category || '—'}</td>
                        <td className="max-w-[280px] pr-3 text-slate-400">{[row.address, row.city, row.country].filter(Boolean).join(', ') || '—'}</td>
                        <td className="pr-3 text-slate-300">{row.email || row.phone || '—'}{row.website && <div className="max-w-[180px] truncate text-slate-500">{row.website}</div>}</td>
                        <td className="pr-3 text-right font-mono text-slate-300">{row.rating ? `${row.rating} (${row.reviewsCount})` : '—'}</td>
                        <td className="whitespace-nowrap text-slate-500">{new Date(row.lastSeen).toLocaleDateString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cacheReport.rows.length === 0 && <div className="py-8 text-center text-slate-500">Không có doanh nghiệp phù hợp.</div>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>Trang {cacheReport.page + 1}/{cacheTotalPages}</span>
                <div className="flex gap-1">
                  <button type="button" disabled={cacheReport.page <= 0} onClick={() => setCachePage(p => Math.max(0, p - 1))} className="rounded border border-slate-700 p-1.5 hover:bg-slate-800 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={cacheReport.page + 1 >= cacheTotalPages} onClick={() => setCachePage(p => p + 1)} className="rounded border border-slate-700 p-1.5 hover:bg-slate-800 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <section className={card}>
        <h3 className="font-semibold text-white mb-2">Cấu hình chạy đa luồng</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
            <div className="text-[11px] text-slate-400">Luồng nền tối đa</div>
            <div className="text-lg font-bold text-cyan-300 font-mono">{workerCount} luồng</div>
          </div>
          <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
            <div className="text-[11px] text-slate-400">Giới hạn cập nhật nền</div>
            <div className="text-lg font-bold text-cyan-300 font-mono">{info.bgPerHour} truy vấn/giờ</div>
          </div>
          <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
            <div className="text-[11px] text-slate-400">Worker người dùng</div>
            <div className="text-lg font-bold text-emerald-300 font-mono">1 ưu tiên</div>
          </div>
        </div>
        <form onSubmit={saveWorkers} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-slate-400">Số luồng nền (1–8)
            <input value={workerDraft} onChange={(e) => { workerDirty.current = true; configDirty.current = true; setWorkerDraft(e.target.value); }} type="number" min={1} max={8} step={1}
              className="mt-1 block w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400" />
          </label>
          <label className="text-[11px] text-slate-400">Chu kỳ quét (phút)
            <input value={intervalDraft} onChange={(e) => { configDirty.current = true; setIntervalDraft(e.target.value); }} type="number" min={5} max={1440} step={5}
              className="mt-1 block w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[11px] text-slate-300">
            <input checked={scanEnabled} onChange={(e) => { configDirty.current = true; setScanEnabled(e.target.checked); }} type="checkbox" className="accent-cyan-500" />
            Tự động quét kho cũ
          </label>
          <button type="submit" disabled={savingWorkers}
            className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
            {savingWorkers ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
          {workerMessage && <span className="text-[11px] text-cyan-300">{workerMessage}</span>}
        </form>
        <p className="mt-2 text-[11px] text-slate-500">Job người dùng luôn được ưu tiên. Thay đổi được lưu trong database và không cần restart service.</p>
      </section>

      <section className={card}>
        <h3 className="font-semibold text-white mb-2">Đang chạy</h3>
        {[info.running, ...backgroundRunning].filter(Boolean).length > 0 ? (
          <div className="space-y-3">
            {[info.running, ...backgroundRunning].filter((j): j is JobRow => Boolean(j)).map((job) => (
              <div key={job.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2"><Kind j={job} />
                  <span className="text-slate-300">{job.autoTask ? `Tác vụ #${job.autoTask.id}${job.autoTask.product ? ` · ${job.autoTask.product} → ${job.autoTask.country}` : ''}` : job.user || 'hệ thống'}</span>
                  <span className="text-slate-500">· {job.startedAt ? fmtDur(info.now - job.startedAt) : 'đang khởi động'}</span>
                  <span className="text-slate-500">· {job.count} điểm (kho {job.cache} / mới {job.live})</span>
                  {job.proxies > 0 ? <span className="text-slate-500">· {job.proxies} proxy</span> : <span className="text-slate-500">· IP máy chủ</span>}
                  {job.detached && <span className="text-amber-300">· đã ngắt kết nối, đang chạy nốt</span>}
                </div>
                <div className="text-slate-300 font-mono break-words">{job.queries.join(' | ')}</div>
              </div>
            ))}
          </div>
        ) : info.autoQueue.total > 0 ? (
          <div className="text-slate-400">Máy đang rảnh trong giây lát (nghỉ giữa các cặp hoặc nghỉ chống bị chặn). Còn {info.autoQueue.total} cặp của tác vụ tự động đang chờ.</div>
        ) : <div className="text-slate-500">Máy đang rảnh.</div>}
      </section>

      <div className="flex gap-1 border-b border-slate-800" role="tablist">
        {([['manual', 'Thủ công', info.autoQueues.manual.total], ['auto', 'Tự động (lịch xoay vòng)', info.autoQueues.plan.total]] as const).map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={bgTab === id} onClick={() => setBgTab(id)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px ${bgTab === id ? 'text-white border-emerald-500 bg-slate-900' : 'text-slate-400 border-transparent hover:text-white'}`}>
            {label} <span className="ml-1 text-[10px] text-slate-500">({n} cặp chờ)</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1" role="tablist" aria-label="Trạng thái cặp">
        {([
          ['pending', 'Cặp Chờ', activeQueue.total],
          ['running', 'Đang Chạy', activeQueue.running],
          ['completed', 'Hoàn thành', activeQueue.completed],
        ] as const).map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={pairTab === id} onClick={() => setPairTab(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${pairTab === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
            {label} <span className="ml-1 text-[10px] opacity-80">({n})</span>
          </button>
        ))}
      </div>

      {bgTab === 'manual' ? (
        <>
          <AutoTasks kind="manual" pairTab={pairTab} />
          {pairTab === 'pending' && <QueueSection title="Hàng chờ tác vụ thủ công" q={info.autoQueues.manual} />}
        </>
      ) : (
        <>
          <AutoPlan />
          <AutoTasks kind="plan" pairTab={pairTab} />
          {pairTab === 'pending' && <QueueSection title="Hàng chờ lịch xoay vòng" q={info.autoQueues.plan} />}
        </>
      )}


      <section className={card}>
        <h3 className="font-semibold text-white mb-2">Hàng đợi người dùng ({info.queue.length})</h3>
        <p className="text-[11px] text-slate-500 mb-2">Lượt tìm do người dùng bấm “Tìm lead”; luôn được chạy trước tác vụ tự động.</p>
        {info.queue.length === 0 ? <div className="text-slate-500">Không có người dùng nào đang chờ.</div> : (
          <ul className="space-y-1.5">
            {info.queue.map(j => (
              <li key={j.id} className="flex flex-wrap items-center gap-2"><Kind j={j} /><span className="text-slate-300">{j.autoTask ? `Tác vụ #${j.autoTask.id}` : j.user || 'hệ thống'}</span>
                <span className="text-slate-500">· chờ {fmtDur(info.now - j.createdAt)}</span>
                <span className="text-slate-400 font-mono truncate max-w-full">{j.queries.slice(0, 3).join(' | ')}{j.queries.length > 3 ? ` (+${j.queries.length - 3})` : ''}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-white mb-2">Chờ cập nhật dữ liệu kho cũ ({info.pending.length})</h3>
        {info.pending.length === 0 ? <div className="text-slate-500">Không có dữ liệu cũ cần làm mới.</div> : (
          <ul className="space-y-1">
            {info.pending.map((p, i) => (
              <li key={i} className="text-slate-300 font-mono">{p.query} <span className="text-slate-500">· độ sâu {p.depth}{p.withEmail ? ' · email' : ''}{p.proxies ? ` · ${p.proxies} proxy` : ''}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-white mb-1">Lịch sử {info.logKeepDays} ngày ({info.logTotal} lần, hiện 100 gần nhất)</h3>
        <p className="text-[11px] text-slate-500 mb-2">Lưu trong cơ sở dữ liệu, không mất khi deploy; tự xóa sau {info.logKeepDays} ngày. “Từ kho” = tìm kiếm trả hoàn toàn từ dữ liệu đã lưu, không mở trình duyệt.</p>
        {info.recent.length === 0 ? <div className="text-slate-500">Chưa có.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="text-slate-400 border-b border-slate-800"><th className="py-1.5 pr-3">Kết thúc</th><th className="pr-3">Loại</th><th className="pr-3">Người dùng</th><th className="pr-3">Truy vấn</th><th className="pr-3">Điểm</th><th className="pr-3">Thời gian</th><th>Kết quả</th></tr></thead>
              <tbody className="divide-y divide-slate-800/70">
                {info.recent.map(j => (
                  <tr key={j.id + (j.finishedAt || 0)} className="align-top">
                    <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">{fmtDateTime(j.finishedAt)}</td>
                    <td className="pr-3"><Kind j={j} /></td>
                    <td className="pr-3 text-slate-300">{j.user || 'hệ thống'}</td>
                    <td className="pr-3 text-slate-300 font-mono max-w-[360px] break-words">{j.queries.slice(0, 2).join(' | ')}{j.queries.length > 2 ? ` (+${j.queries.length - 2})` : ''}</td>
                    <td className="pr-3 font-mono tabular-nums text-slate-200">{j.count}</td>
                    <td className="pr-3 font-mono text-slate-400 whitespace-nowrap">{j.startedAt && j.finishedAt ? fmtDur(j.finishedAt - j.startedAt) : '—'}</td>
                    <td className={j.status === 'failed' ? 'text-red-300' : 'text-slate-300'}>{STATUS[j.status || ''] || j.status}{j.message ? ` — ${j.message}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-white mb-1">Gọi AI (gợi ý của người dùng, tác vụ tự động, chia khu vực)</h3>
        {info.ai.enabled ? (
          <>
            <p className="text-[11px] text-slate-400 mb-2">
              Model {info.ai.model} · giới hạn {info.ai.dailyLimit} lượt/người/ngày · 30 ngày qua: {info.ai.calls30d} lượt ({info.ai.ok30d} thành công),
              {' '}{info.ai.inputTokens30d.toLocaleString('vi-VN')} token vào / {info.ai.outputTokens30d.toLocaleString('vi-VN')} token ra
            </p>
            {info.ai.recent.length === 0 ? <div className="text-slate-500">Chưa có lượt nào.</div> : (
              <ul className="space-y-1">
                {info.ai.recent.map((r, i) => (
                  <li key={i} className="flex flex-wrap gap-x-3 text-slate-300">
                    <span className="font-mono text-slate-400">{fmtDateTime(r.at)}</span>
                    <span>{r.user || '—'}</span>
                    <span className={r.ok ? 'text-emerald-300' : 'text-red-300'}>{r.ok ? `${r.items} gợi ý` : r.message || 'Lỗi'}</span>
                    {r.ok && <span className="text-slate-500 font-mono">{r.input}/{r.output} token</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="text-amber-300">Chưa bật: thiếu API key hoặc model. Cấu hình trong menu tài khoản → <strong>Cấu hình AI</strong>.</div>
        )}
      </section>

    </div>
  );
};
