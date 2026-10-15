import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../auth/types';

interface JobRow {
  id: string;
  background: boolean;
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
  queue: JobRow[];
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
  cache: { places: number; queries: number; hits: number };
}

const fmtTime = (t: number | null | undefined) => (t ? new Date(t).toLocaleTimeString('vi-VN') : '—');
const fmtDateTime = (t: number | null | undefined) => (t ? new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}p ${s % 60}s` : `${s}s`;
};
const STATUS: Record<string, string> = { done: 'Xong', cancelled: 'Đã hủy', failed: 'Lỗi' };

const Kind: React.FC<{ j: JobRow }> = ({ j }) => (
  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${j.background ? 'bg-purple-500/20 text-purple-300' : j.cacheOnly ? 'bg-slate-500/20 text-slate-300' : 'bg-blue-500/20 text-blue-300'}`}>
    {j.background ? 'Nền (cập nhật kho)' : j.cacheOnly ? 'Từ kho' : j.force ? 'Người dùng · cào mới' : 'Người dùng'}
  </span>
);

export const AdminBackgroundView: React.FC = () => {
  const [info, setInfo] = useState<BackgroundInfo | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setInfo(await apiJson<BackgroundInfo>('/admin/background'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!info) return <div className="text-xs text-slate-400">{error ? `⚠️ ${error}` : 'Đang tải…'}</div>;

  const card = 'bg-slate-950 border border-slate-800 rounded-lg p-4';
  const stat = (label: string, value: React.ReactNode) => (
    <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-lg font-bold text-white font-mono tabular-nums">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Chạy ngầm</h2>
        <span className="text-[11px] text-slate-500">Tự làm mới mỗi 5 giây · {fmtTime(info.now)}</span>
      </div>
      {error && <div className="p-2 bg-amber-500/10 border border-amber-500/40 rounded text-amber-200">⚠️ {error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {stat('Đang chạy', info.running ? 1 : 0)}
        {stat('Hàng đợi người dùng', info.queue.length)}
        {stat('Chờ cập nhật nền', info.pending.length)}
        {stat('Nền giờ này', `${info.bgDoneThisHour}/${info.bgPerHour}`)}
        {stat('Kho', `${info.cache.places} điểm`)}
      </div>
      <p className="text-[11px] text-slate-500">
        Dữ liệu trong kho quá {info.ttlDays} ngày sẽ được cào lại ở nền khi máy rảnh (tối đa {info.bgPerHour} truy vấn/giờ), không tính hạn mức của ai.
        Kho: {info.cache.queries} truy vấn, {info.cache.hits} lượt dùng lại.
      </p>

      <section className={card}>
        <h3 className="font-semibold text-white mb-1">Gợi ý AI từ hồ sơ</h3>
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
          <div className="text-amber-300">Chưa bật: máy chủ chưa có <code className="font-mono">ANTHROPIC_API_KEY</code> (đặt trong <code className="font-mono">/opt/maps/.env</code> rồi khởi động lại <code className="font-mono">maps-api</code>).</div>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-white mb-2">Đang chạy</h3>
        {info.running ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2"><Kind j={info.running} /><span className="text-slate-300">{info.running.user || 'hệ thống'}</span>
              <span className="text-slate-500">· {info.running.startedAt ? fmtDur(info.now - info.running.startedAt) : 'đang khởi động'}</span>
              <span className="text-slate-500">· {info.running.count} điểm (kho {info.running.cache} / mới {info.running.live})</span>
              {info.running.detached && <span className="text-amber-300">· đã ngắt kết nối, đang chạy nốt</span>}
            </div>
            <div className="text-slate-300 font-mono break-words">{info.running.queries.join(' | ')}</div>
          </div>
        ) : <div className="text-slate-500">Máy đang rảnh.</div>}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-white mb-2">Hàng đợi ({info.queue.length})</h3>
        {info.queue.length === 0 ? <div className="text-slate-500">Trống.</div> : (
          <ul className="space-y-1.5">
            {info.queue.map(j => (
              <li key={j.id} className="flex flex-wrap items-center gap-2"><Kind j={j} /><span className="text-slate-300">{j.user || 'hệ thống'}</span>
                <span className="text-slate-500">· chờ {fmtDur(info.now - j.createdAt)}</span>
                <span className="text-slate-400 font-mono truncate max-w-full">{j.queries.slice(0, 3).join(' | ')}{j.queries.length > 3 ? ` (+${j.queries.length - 3})` : ''}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-white mb-2">Chờ cập nhật nền ({info.pending.length})</h3>
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
    </div>
  );
};
