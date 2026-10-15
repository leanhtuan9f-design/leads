import React, { useEffect, useState } from 'react';
import { apiJson } from '../auth/types';
import { ScrapedBusiness, ScraperJob } from '../types/scraper';

type Trashed = (ScrapedBusiness | ScraperJob) & { id: string };

interface Props {
  kind: 'leads' | 'jobs';
  onRestore: (items: any[]) => void;
  onClose: () => void;
}

const labelOf = (kind: Props['kind'], x: Trashed) =>
  kind === 'leads'
    ? { title: (x as ScrapedBusiness).title, sub: (x as ScrapedBusiness).address }
    : { title: (x as ScraperJob).name, sub: `${(x as ScraperJob).scrapedCount ?? 0} kết quả · ${(x as ScraperJob).startedAt ?? ''}` };

// Lead/job đã bị xóa (xóa mềm trên server) — cho phép khôi phục
export function TrashModal({ kind, onRestore, onClose }: Props) {
  const [items, setItems] = useState<Trashed[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ items: Trashed[] }>(`/items/${kind}/trash`)
      .then(r => setItems(r.items))
      .catch(e => setError(e instanceof Error ? e.message : 'Không tải được'));
  }, []);

  const restore = (list: Trashed[]) => {
    onRestore(list);
    const ids = new Set(list.map(b => b.id));
    setItems(prev => (prev || []).filter(b => !ids.has(b.id)));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d1420] border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-100">{kind === 'leads' ? 'Lead' : 'Job'} đã xóa{items ? ` (${items.length})` : ''}</h2>
          <div className="flex items-center gap-3">
            {items && items.length > 0 && (
              <button type="button" onClick={() => restore(items)} className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white">Khôi phục tất cả</button>
            )}
            <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-white">Đóng</button>
          </div>
        </div>
        <div className="overflow-y-auto p-2">
          {error && <p className="p-3 text-xs text-red-300">{error}</p>}
          {!items && !error && <p className="p-3 text-xs text-slate-400">Đang tải...</p>}
          {items && items.length === 0 && <p className="p-3 text-xs text-slate-400">Không có mục nào đã xóa.</p>}
          {items?.map(b => (
            <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-slate-800/60">
              <div className="min-w-0">
                <div className="text-xs text-slate-100 truncate">{labelOf(kind, b).title}</div>
                <div className="text-[11px] text-slate-500 truncate">{labelOf(kind, b).sub}</div>
              </div>
              <button type="button" onClick={() => restore([b])} className="text-[11px] text-blue-300 hover:text-white shrink-0">Khôi phục</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
