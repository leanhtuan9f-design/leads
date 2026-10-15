import React, { useState, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Briefcase, 
  Zap, 
  SlidersHorizontal, 
  HelpCircle, 
  CheckCircle2, 
  Layers, 
  Flame, 
  ShieldCheck,
  Building,
  RotateCcw
} from 'lucide-react';
import { ScraperOptions, ScrapedBusiness } from '../types/scraper';
import { estimateMarketTotal, getDynamicSubdivisions } from '../services/scraperEngine';
import { HelpButton } from './HelpButton';

interface DirectScrapeBarProps {
  existingBusinesses?: ScrapedBusiness[];
  onStartScrape: (options: ScraperOptions) => void;
  isRunning: boolean;
  onOpenAdvancedModal: () => void;
  onOpenGuide: (guideId: string) => void;
}

const QUICK_SEARCH_EXAMPLES = [
  { category: 'Phòng khám nha khoa', location: 'Hà Nội' },
  { category: 'Quán cà phê', location: 'Quận 1, TP.HCM' },
  { category: 'Công ty cơ khí', location: 'Bình Dương' },
  { category: 'Spa làm đẹp', location: 'Hải Phòng' },
  { category: 'Thầu xây dựng', location: 'Cần Thơ' },
  { category: 'Công ty luật', location: 'Đà Nẵng' },
  { category: 'Khách sạn', location: 'Đà Lạt' },
  { category: 'Kho vận Logistics', location: '21.0285, 105.8542' },
  { category: 'Trung tâm Ngoại ngữ', location: 'Quận Cầu Giấy, Hà Nội' },
  { category: 'Đại lý nông sản', location: 'Đắk Lắk' }
];

export const DirectScrapeBar: React.FC<DirectScrapeBarProps> = ({
  existingBusinesses = [],
  onStartScrape,
  isRunning,
  onOpenAdvancedModal,
  onOpenGuide
}) => {
  const [category, setCategory] = useState('Phòng khám nha khoa');
  const [location, setLocation] = useState('Hà Nội');
  const [maxResults, setMaxResults] = useState(25);
  const [useDistrictSubdivision, setUseDistrictSubdivision] = useState(true);
  const [guaranteedFullBatch, setGuaranteedFullBatch] = useState(true);
  const [safetyThrottleMode, setSafetyThrottleMode] = useState<'safe' | 'balanced' | 'turbo'>('safe');

  // Dynamically resolve subdivisions (districts or 9-quadrant spatial grid) for ANY location on Earth
  const activeDistricts = useMemo(() => {
    return getDynamicSubdivisions(location.trim() || 'Hà Nội');
  }, [location]);

  // Calculate market saturation and existing listings count in database
  const marketInfo = useMemo(() => {
    const list = Array.isArray(existingBusinesses) ? existingBusinesses : [];
    if (!category.trim() || !location.trim()) {
      return { totalEstimated: 115, existingCount: 0, coveragePct: 0, remaining: 115, isExhausted: false };
    }

    const totalEstimated = estimateMarketTotal(category, location);
    const normCat = category.toLowerCase().trim();

    // Match businesses already in DB matching category or title
    const matchingBusinesses = list.filter(b => {
      const matchCat = (b.category && b.category.toLowerCase().includes(normCat)) || 
                       (b.title && b.title.toLowerCase().includes(normCat));
      return matchCat;
    });

    const existingCount = matchingBusinesses.length;
    const coveragePct = Math.min(100, Math.round((existingCount / totalEstimated) * 100));
    const remaining = Math.max(0, totalEstimated - existingCount);
    const isExhausted = existingCount >= totalEstimated || coveragePct >= 95;

    return { totalEstimated, existingCount, coveragePct, remaining, isExhausted };
  }, [category, location, existingBusinesses]);

  const handleStartBatch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!category.trim() || !location.trim() || isRunning) return;

    const fullQuery = `${category.trim()} tại ${location.trim()}`;

    onStartScrape({
      query: fullQuery,
      category: category.trim(),
      location: location.trim(),
      maxResults,
      extractEmails: true,
      extractSocials: true,
      skipWithoutPhone: false,
      skipWithoutWebsite: false,
      proxyType: safetyThrottleMode === 'safe' ? 'residential_proxy' : 'datacenter_rotating',
      language: 'vi',
      existingBusinesses, // Pass database to automatically skip duplicates!
      scrapeMode: 'batch',
      useDistrictSubdivision,
      guaranteedFullBatch,
      safetyThrottleMode,
      concurrentWorkers: 4
    });
  };

  const handleStartExhaustive = () => {
    if (!category.trim() || !location.trim() || isRunning) return;

    const fullQuery = `${category.trim()} tại ${location.trim()}`;

    onStartScrape({
      query: fullQuery,
      category: category.trim(),
      location: location.trim(),
      maxResults: marketInfo.remaining > 0 ? marketInfo.remaining : 100,
      extractEmails: true,
      extractSocials: true,
      skipWithoutPhone: false,
      skipWithoutWebsite: false,
      proxyType: 'residential_proxy',
      language: 'vi',
      existingBusinesses, // Pass database to automatically skip duplicates!
      scrapeMode: 'exhaustive',
      useDistrictSubdivision: true,
      guaranteedFullBatch: true,
      safetyThrottleMode,
      concurrentWorkers: 4
    });
  };

  const handleQuickSelect = (cat: string, loc: string) => {
    setCategory(cat);
    setLocation(loc);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-xl mb-5 space-y-3.5">
      {/* Title & Help */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600/20 text-blue-400 rounded-md">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Khu vực Cào Dữ Liệu Google Maps & Bóc tách Lead
              </h2>
              <button
                type="button"
                onClick={() => onOpenGuide('deduplication_and_market_exhaustion')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                title="Bấm để xem hướng dẫn cách không cào lại & cách cào đủ hơn 100 điểm"
              >
                <HelpCircle className="w-3 h-3 text-amber-400" />
                <span>Cách cào đủ &gt;100 điểm &amp; không cào trùng?</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenGuide('multi_user_google_policy')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors"
                title="Xem giải pháp chống chặn IP & chính sách Google khi nhiều người dùng quét cùng lúc"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Chính sách Google &amp; Chống chặn IP Đa người dùng</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Nhập riêng <strong className="text-slate-200">[Ngành nghề]</strong> và <strong className="text-slate-200">[Địa điểm hoặc Tọa độ GPS]</strong> — Tự động lọc bỏ các cơ sở đã có trong cơ sở dữ liệu!
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAdvancedModal}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors self-start sm:self-auto"
          title="Tùy chỉnh Proxy, lọc bắt buộc SĐT hoặc website"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
          <span>Tùy chọn nâng cao</span>
        </button>
      </div>

      {/* Main Scrape Form with 2 Explicit Inputs */}
      <form onSubmit={handleStartBatch} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          {/* Ô nhập 1: [Ngành nghề / Dịch vụ] */}
          <div className="md:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-blue-400" />
              <span>1. Nhập [Ngành nghề / Dịch vụ]</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ví dụ: Phòng khám nha khoa, Quán cafe, Xây dựng..."
                className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                required
              />
            </div>
          </div>

          {/* Ô nhập 2: [Địa điểm / Tọa độ GPS] */}
          <div className="md:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>2. Nhập [Địa điểm / Tọa độ GPS]</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ví dụ: Hà Nội, Quận 1 TP.HCM hoặc 21.0285, 105.8542"
                className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors font-mono"
                required
              />
            </div>
          </div>

          {/* Số lượng địa điểm & Nút Bắt đầu */}
          <div className="md:col-span-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Số lượng mỗi đợt
              </label>
              <select
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value={10}>10 địa điểm</option>
                <option value={25}>25 địa điểm (Chuẩn)</option>
                <option value={50}>50 địa điểm (Quét sâu)</option>
                <option value={100}>100 địa điểm (Lớn)</option>
                <option value={150}>150 địa điểm (Quy mô cao)</option>
              </select>
            </div>

            {/* Nút cào đợt mới */}
            <button
              type="submit"
              disabled={isRunning || !category.trim() || !location.trim()}
              className="py-2 px-3.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs rounded-lg shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap h-[37px]"
              title="Bắt đầu cào đợt mới (Tự động lọc bỏ các địa điểm đã có)"
            >
              <Zap className="w-4 h-4 fill-current text-amber-300" />
              <span>{marketInfo.existingCount > 0 ? `Cào tiếp +${maxResults}` : 'Bắt đầu cào'}</span>
            </button>
          </div>
        </div>

        {/* CƠ CHẾ QUÉT FULL SỐ LƯỢNG MỖI ĐỢT & BỘ ĐIỀU TỐC AN TOÀN GOOGLE MULTI-USER */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-2.5 bg-slate-900/70 border border-slate-800 rounded-lg text-xs">
          {/* Quét Full Chỉ Tiêu */}
          <div className="md:col-span-7 flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={guaranteedFullBatch}
                onChange={(e) => setGuaranteedFullBatch(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-slate-200 font-medium">
                🔥 <strong>Cơ chế Quét Full Chỉ Tiêu Đợt:</strong> Gom đúng <strong className="text-amber-300 font-mono">{maxResults} địa điểm MỚI</strong> (Tự động mở rộng phân khu, không bị nghẽn ở mốc 20-25 kết quả của Google)
              </span>
            </label>
          </div>

          {/* Bộ điều tốc an toàn Google */}
          <div className="md:col-span-5 flex items-center gap-2 justify-start md:justify-end">
            <span className="text-slate-400 text-[11px] whitespace-nowrap">Bộ điều tốc An toàn:</span>
            <select
              value={safetyThrottleMode}
              onChange={(e) => setSafetyThrottleMode(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="safe">🛡️ An toàn cao nhất (Chống chặn IP Đa người dùng)</option>
              <option value="balanced">⚖️ Cân bằng (Tiêu chuẩn)</option>
              <option value="turbo">⚡ Tốc độ cao (Turbo)</option>
            </select>
          </div>
        </div>

        {/* TÙY CHỌN PHÂN RÃ THEO QUẬN/HUYỆN ĐỂ CÀO ĐỦ >100 ĐIỂM */}
        {activeDistricts.length > 0 && (
          <div className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-lg text-xs space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useDistrictSubdivision}
                onChange={(e) => setUseDistrictSubdivision(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0"
              />
              <span className="font-semibold text-slate-200">
                ⚡ Tự động quét phân rã theo {activeDistricts.length} Quận / Phân khu của {location || 'khu vực'} (Giải pháp cào sạch &gt;100 cơ sở {category} không sót ngõ ngách nào)
              </span>
            </label>
            <div className="flex flex-wrap gap-1 pl-5">
              {activeDistricts.map((d: { name: string }, idx: number) => (
                <span key={idx} className="text-[10px] bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/60 font-mono">
                  {d.name.replace('Quận ', '')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* MARKET COVERAGE & DEDUPLICATION BANNER (Giải quyết triệt để câu hỏi của bạn!) */}
        <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg text-xs space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-slate-200">
                <span className="text-slate-400">Tiến độ thu thập {category} tại {location}: </span>
                <strong className="text-white font-mono tabular-nums">
                  Đã có {marketInfo.existingCount} / ~{marketInfo.totalEstimated} địa điểm
                </strong>
                <span className={`font-mono ml-1.5 font-bold ${marketInfo.isExhausted ? 'text-emerald-400' : 'text-blue-400'}`}>
                  ({marketInfo.coveragePct}% độ phủ)
                </span>
              </div>
            </div>

            {/* Chế độ cào cạn kiệt toàn bộ nếu còn điểm chưa cào */}
            {!marketInfo.isExhausted && marketInfo.remaining > 0 ? (
              <button
                type="button"
                onClick={handleStartExhaustive}
                disabled={isRunning}
                className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/50 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 self-start sm:self-auto shadow-sm"
                title="Quét liên tục qua tất cả các quận cho tới khi lấy sạch toàn bộ các địa điểm còn lại trên Google Maps"
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Cào cạn kiệt toàn bộ (~{marketInfo.remaining} điểm còn lại)</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã cào sạch 100% thị trường (Không còn địa điểm mới)</span>
              </div>
            )}
          </div>

          {/* Progress bar of market coverage */}
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                marketInfo.isExhausted ? 'bg-emerald-400' : 'bg-blue-500'
              }`}
              style={{ width: `${marketInfo.coveragePct}%` }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-1">
            <span>
              🛡️ <strong>Cơ chế chống cào trùng:</strong> Bộ cào tự động đối chiếu Place ID &amp; SĐT. Nếu cơ sở đã có trong máy sẽ <strong>BỎ QUA</strong> và chỉ gom các điểm <strong>MỚI TINH</strong>.
            </span>
            <span className="font-mono text-slate-300 tabular-nums shrink-0">
              {marketInfo.remaining > 0 ? `Còn khoảng ~${marketInfo.remaining} cơ sở chưa cào` : 'Đã bao phủ cạn kiệt 100%'}
            </span>
          </div>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
          <span className="text-slate-400 font-medium">Gợi ý mẫu nhanh:</span>
          {QUICK_SEARCH_EXAMPLES.map((ex, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleQuickSelect(ex.category, ex.location)}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded transition-colors"
            >
              <span className="text-blue-400">{ex.category}</span>
              <span className="text-slate-500 mx-1">@</span>
              <span className="font-mono text-emerald-400">{ex.location}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
};
