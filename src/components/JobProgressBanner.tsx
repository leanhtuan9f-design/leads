import React from 'react';
import { CheckCircle2, X, FileSpreadsheet, Eye } from 'lucide-react';
import { ProgressCallbackData } from '../services/scraperEngine';
import { ScrapedBusiness } from '../types/scraper';

export interface CompletionSummaryData {
  query: string;
  totalScraped: number;
  withEmail: number;
  withPhone: number;
  unclaimed: number;
  completedAt: string;
  results: ScrapedBusiness[];
  skippedDuplicates?: number;
  marketCoveragePct?: number;
  marketEstimatedTotal?: number;
  isMarketExhausted?: boolean;
}

interface JobProgressBannerProps {
  progress: ProgressCallbackData | null;
  isRunning: boolean;
  completionSummary: CompletionSummaryData | null;
  /** Ghi chú phụ (nguồn dữ liệu, cảnh báo) hiện dưới dòng chính */
  info?: string | null;
  onCancel: () => void;
  onCloseCompletion: () => void;
  onExportCsv: (results: ScrapedBusiness[]) => void;
  onViewResults: (results: ScrapedBusiness[]) => void;
}

export const JobProgressBanner: React.FC<JobProgressBannerProps> = ({
  progress,
  isRunning,
  completionSummary,
  info,
  onCancel,
  onCloseCompletion,
  onExportCsv,
  onViewResults
}) => {
  const infoLine = info ? <p className="text-[11px] text-slate-400 mt-1.5">{info}</p> : null;

  // Hoàn tất: một dòng tóm tắt + 2 hành động
  if (!isRunning && completionSummary) {
    const c = completionSummary;
    return (
      <div className="bg-emerald-950/30 border border-emerald-600/40 rounded-xl px-4 py-3 mb-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-200 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-white">Đã thêm {c.totalScraped} lead</strong>
              <span className="text-slate-300"> · {c.withPhone} có SĐT · {c.withEmail} có email</span>
              {c.skippedDuplicates ? <span className="text-slate-400"> · bỏ qua {c.skippedDuplicates} trùng</span> : null}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onViewResults(c.results)}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" /> Xem
            </button>
            <button
              onClick={() => onExportCsv(c.results)}
              className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Xuất CSV
            </button>
            <button onClick={onCloseCompletion} className="p-1 text-slate-400 hover:text-white rounded-md" title="Đóng" aria-label="Đóng">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {infoLine}
      </div>
    );
  }

  if (!isRunning && !progress) return null;

  // Đang chạy: thanh tiến độ + Dừng
  const scraped = progress?.scrapedCount || 0;
  const total = progress?.totalFound || 1;
  const percent = Math.min(100, Math.round((scraped / total) * 100));

  return (
    <div className="bg-slate-900 border border-blue-900/60 rounded-xl px-4 py-3 mb-4 text-sm">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-white font-medium truncate">
              Đang tìm {progress?.currentQuery ? `“${progress.currentQuery}”` : '…'}
            </span>
            <span className="font-mono text-xs text-blue-300 tabular-nums shrink-0">{scraped} / {total}</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
            <div className="bg-blue-500 h-full transition-all duration-300 ease-out rounded-full" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-700 rounded-md transition-colors flex items-center gap-1 shrink-0"
        >
          <X className="w-3.5 h-3.5 text-rose-400" /> Dừng
        </button>
      </div>
      {progress?.statusMessage && <p className="text-[11px] text-slate-500 mt-1.5 truncate">{progress.statusMessage}</p>}
      {infoLine}
    </div>
  );
};
