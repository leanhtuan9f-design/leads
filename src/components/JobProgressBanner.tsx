import React from 'react';
import { 
  CheckCircle2, 
  Zap, 
  X, 
  FileSpreadsheet, 
  Send, 
  MapPin, 
  HelpCircle,
  Mail,
  Phone,
  AlertCircle
} from 'lucide-react';
import { ProgressCallbackData } from '../services/scraperEngine';
import { ScrapedBusiness } from '../types/scraper';
import { HelpButton } from './HelpButton';

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
  onCancel: () => void;
  onCloseCompletion: () => void;
  onExportCsv: (results: ScrapedBusiness[]) => void;
  onOpenOutreach: (results: ScrapedBusiness[]) => void;
  onViewOnMap: () => void;
  onOpenGuide: (guideId: string) => void;
}

export const JobProgressBanner: React.FC<JobProgressBannerProps> = ({
  progress,
  isRunning,
  completionSummary,
  onCancel,
  onCloseCompletion,
  onExportCsv,
  onOpenOutreach,
  onViewOnMap,
  onOpenGuide
}) => {
  // Case 1: Job completed successfully -> Show clear celebratory Completion Banner
  if (!isRunning && completionSummary) {
    const isFullMarketExhausted = Boolean(
      completionSummary.isMarketExhausted || 
      (completionSummary.marketCoveragePct && completionSummary.marketCoveragePct >= 95)
    );

    return (
      <div className={`border rounded-xl p-4 shadow-lg text-xs mb-5 animate-in fade-in slide-in-from-top-2 duration-300 ${
        isFullMarketExhausted 
          ? 'bg-emerald-950/50 border-emerald-500/80' 
          : 'bg-emerald-950/30 border-emerald-500/50'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-emerald-800/50">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-emerald-300 text-sm">
                  {isFullMarketExhausted 
                    ? '🎉 ĐÃ QUÉT HẾT 100% — ĐÃ CÀO SẠCH TOÀN BỘ ĐỊA ĐIỂM KHÔNG CÒN SÓT CƠ SỞ NÀO!' 
                    : `✅ ĐÃ HOÀN TẤT: CÀO THÀNH CÔNG ${completionSummary.totalScraped} ĐỊA ĐIỂM MỚI TINH!`}
                </span>
                <span className="text-emerald-200/80 font-mono text-[11px] bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/60">
                  {completionSummary.completedAt}
                </span>
                <HelpButton guideId="deduplication_and_market_exhaustion" onOpenGuide={onOpenGuide} tooltipText="Xem cách không cào lại & cách cào đủ >100 điểm" />
              </div>
              <p className="text-slate-300 text-xs mt-0.5">
                Crawler đã bóc tách xong: <strong className="text-white">"{completionSummary.query}"</strong>. 
                {completionSummary.skippedDuplicates && completionSummary.skippedDuplicates > 0 ? (
                  <span className="text-amber-300 font-medium ml-1">
                    (Đã tự động BỎ QUA {completionSummary.skippedDuplicates} cơ sở đã có trong máy để đảm bảo không trùng lặp).
                  </span>
                ) : (
                  <span className="text-slate-400 ml-1">Toàn bộ đã được kiểm duyệt không trùng lặp và nạp vào bảng bên dưới.</span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onCloseCompletion}
            className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors shrink-0"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Result Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 my-3 font-mono text-[11px]">
          <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div>
              <span className="text-slate-400 block text-[10px]">Địa điểm mới</span>
              <span className="text-white font-bold text-xs tabular-nums">{completionSummary.totalScraped} hồ sơ</span>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div>
              <span className="text-slate-400 block text-[10px]">Đã bóc tách Email</span>
              <span className="text-emerald-400 font-bold text-xs tabular-nums">{completionSummary.withEmail} email</span>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="text-slate-400 block text-[10px]">Có Số điện thoại</span>
              <span className="text-white font-bold text-xs tabular-nums">{completionSummary.withPhone} SĐT</span>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <span className="text-slate-400 block text-[10px]">Bỏ qua trùng lặp</span>
              <span className="text-amber-300 font-bold text-xs tabular-nums">
                {completionSummary.skippedDuplicates || 0} điểm trùng
              </span>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex items-center gap-2 col-span-2 sm:col-span-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="text-slate-400 block text-[10px]">Độ phủ thị trường</span>
              <span className="text-emerald-400 font-bold text-xs tabular-nums">
                {completionSummary.marketCoveragePct || 100}%
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onExportCsv(completionSummary.results)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Xuất file CSV ngay ({completionSummary.totalScraped})</span>
            </button>

            <button
              onClick={() => onOpenOutreach(completionSummary.results)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Soạn Email tiếp cận</span>
            </button>

            <button
              onClick={onViewOnMap}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>Xem trên Bản đồ</span>
            </button>
          </div>

          <span className="text-slate-400 text-[11px] font-mono">
            Trạng thái: Đã lưu an toàn vào cơ sở dữ liệu
          </span>
        </div>
      </div>
    );
  }

  // Case 2: Currently Scraping
  if (!isRunning && !progress) return null;

  const scraped = progress?.scrapedCount || 0;
  const total = progress?.totalFound || 1;
  const percent = Math.min(100, Math.round((scraped / total) * 100));

  return (
    <div className="bg-slate-900 border border-blue-900/60 rounded-xl p-3.5 shadow-md text-xs mb-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 fill-current animate-pulse text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white">Đang cào dữ liệu Google Maps:</span>
              <span className="text-blue-300 font-medium font-mono">"{progress?.currentQuery}"</span>
              <span className="font-mono text-[11px] bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800/60">
                Đang chạy ({percent}%)
              </span>
              {progress?.skippedDuplicates && progress.skippedDuplicates > 0 ? (
                <span className="font-mono text-[11px] bg-amber-950/80 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/60 flex items-center gap-1">
                  🛡️ Đã bỏ qua {progress.skippedDuplicates} điểm trùng
                </span>
              ) : null}
              <HelpButton guideId="deduplication_and_market_exhaustion" onOpenGuide={onOpenGuide} tooltipText="Xem cách nhận biết khi quét xong & chống cào trùng" />
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate max-w-xl">
              {progress?.statusMessage || 'Đang kết nối tới hàng đợi crawler...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Tốc độ quét</div>
            <div className="font-mono text-xs font-semibold text-blue-400 tabular-nums">
              {progress?.speedPerMin || 120} <span className="font-normal text-[10px] text-slate-400">địa điểm/phút</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-slate-400">Đã bóc tách MỚI</div>
            <div className="font-mono text-xs font-bold text-white tabular-nums">
              {scraped} / {total}
            </div>
          </div>

          <button
            onClick={onCancel}
            className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-700 rounded transition-colors flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5 text-rose-400" />
            <span>Dừng cào</span>
          </button>
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
        <div
          className="bg-blue-500 h-full transition-all duration-300 ease-out rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
