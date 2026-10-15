import React, { useState, useMemo } from 'react';
import { Search, MapPin, Briefcase, ChevronRight } from 'lucide-react';
import { ScraperOptions, ScrapedBusiness } from '../types/scraper';
import { Quota } from '../auth/types';
import { estimateMarketTotal } from '../services/scraperEngine';

interface DirectScrapeBarProps {
  existingBusinesses?: ScrapedBusiness[];
  onStartScrape: (options: ScraperOptions) => void;
  isRunning: boolean;
  proxiesText: string;
  onChangeProxies: (text: string) => void;
  proxyCount?: number;
  quota?: Quota | null;
}

// Giá trị đặc biệt của ô "Số lượng": lấy tối đa có thể (chế độ exhaustive)
const FULL_BATCH = 0;

// Gợi ý chỉ hiện khi chưa có lead nào
const QUICK_SEARCH_EXAMPLES = [
  { category: 'Phòng khám nha khoa', location: 'Hà Nội' },
  { category: 'Quán cà phê', location: 'Quận 1, TP.HCM' },
  { category: 'Spa làm đẹp', location: 'Hải Phòng' },
  { category: 'Khách sạn', location: 'Đà Lạt' }
];

export const DirectScrapeBar: React.FC<DirectScrapeBarProps> = ({
  existingBusinesses = [],
  onStartScrape,
  isRunning,
  proxiesText,
  onChangeProxies,
  proxyCount = 0,
  quota = null
}) => {
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [maxResults, setMaxResults] = useState(25);
  const [showOptions, setShowOptions] = useState(false);
  const [skipWithoutPhone, setSkipWithoutPhone] = useState(false);
  const [skipWithoutWebsite, setSkipWithoutWebsite] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  // Số lượng dùng cho "Tất cả có thể": ước lượng thị trường trừ số đã có (heuristic)
  const fullTarget = useMemo(() => {
    if (!category.trim() || !location.trim()) return 100;
    const normCat = category.toLowerCase().trim();
    const have = existingBusinesses.filter(b =>
      (b.category && b.category.toLowerCase().includes(normCat)) ||
      (b.title && b.title.toLowerCase().includes(normCat))
    ).length;
    const remaining = estimateMarketTotal(category, location) - have;
    return remaining > 0 ? remaining : 100;
  }, [category, location, existingBusinesses]);

  const quotaFull = quota ? quota.newUsed >= quota.newLimit : false;
  const canSubmit = !isRunning && category.trim() !== '' && location.trim() !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const isFull = maxResults === FULL_BATCH;

    onStartScrape({
      query: `${category.trim()} tại ${location.trim()}`,
      category: category.trim(),
      location: location.trim(),
      maxResults: isFull ? fullTarget : maxResults,
      extractEmails: true,
      skipWithoutPhone,
      skipWithoutWebsite,
      language: 'vi',
      existingBusinesses, // tự bỏ qua cơ sở đã có
      scrapeMode: isFull ? 'exhaustive' : 'batch',
      useDistrictSubdivision: true,
      forceRefresh
    });
  };

  const inputCls =
    'w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors';

  return (
    <form onSubmit={handleSubmit} className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-4 mb-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
        <div className="md:col-span-4 relative">
          <Briefcase className="w-4 h-4 absolute left-3 top-3 text-blue-400 pointer-events-none" />
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ngành nghề (vd: nha khoa)"
            aria-label="Ngành nghề"
            className={`${inputCls} pl-9`}
          />
        </div>

        <div className="md:col-span-4 relative">
          <MapPin className="w-4 h-4 absolute left-3 top-3 text-emerald-400 pointer-events-none" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Khu vực (vd: Hà Nội, Quận 1)"
            aria-label="Khu vực"
            className={`${inputCls} pl-9`}
          />
        </div>

        <div className="md:col-span-2">
          <select
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            aria-label="Số lượng"
            className={`${inputCls} px-2.5`}
          >
            <option value={10}>10 lead</option>
            <option value={25}>25 lead</option>
            <option value={50}>50 lead</option>
            <option value={100}>100 lead</option>
            <option value={150}>150 lead</option>
            <option value={FULL_BATCH}>Tất cả có thể</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="md:col-span-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <Search className="w-4 h-4" />
          <span>{isRunning ? 'Đang tìm…' : 'Tìm lead'}</span>
        </button>
      </div>

      {quotaFull && (
        <div className="text-xs text-red-300">
          Hôm nay đã hết hạn mức địa điểm mới ({quota!.newUsed}/{quota!.newLimit}) — chỉ lấy được dữ liệu đã có sẵn trong kho.
        </div>
      )}

      {existingBusinesses.length === 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Thử:</span>
          {QUICK_SEARCH_EXAMPLES.map((ex) => (
            <button
              key={ex.category}
              type="button"
              onClick={() => { setCategory(ex.category); setLocation(ex.location); }}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded transition-colors"
            >
              {ex.category} · {ex.location}
            </button>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowOptions(o => !o)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
          aria-expanded={showOptions}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showOptions ? 'rotate-90' : ''}`} />
          <span>Tuỳ chọn{proxyCount > 0 ? ` · ${proxyCount} proxy` : ''}</span>
        </button>

        {showOptions && (
          <div className="mt-2 p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-3 text-xs text-slate-300">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={skipWithoutPhone} onChange={(e) => setSkipWithoutPhone(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0" />
                <span>Chỉ lấy lead có số điện thoại</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={skipWithoutWebsite} onChange={(e) => setSkipWithoutWebsite(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0" />
                <span>Chỉ lấy lead có website</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={forceRefresh} onChange={(e) => setForceRefresh(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0" />
                <span>
                  Bỏ qua dữ liệu đã lưu, tìm mới hoàn toàn
                  {quota ? ` (đã dùng ${quota.refreshUsed}/${quota.refreshLimit} lần hôm nay)` : ''}
                </span>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="block font-medium text-slate-300">Proxy (mỗi dòng một proxy, tối đa 10)</label>
              <textarea
                value={proxiesText}
                onChange={(e) => onChangeProxies(e.target.value)}
                rows={3}
                spellCheck={false}
                placeholder={'http://user:pass@host:port\nsocks5://user:pass@host:port'}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-[11px] text-slate-500">
                Hỗ trợ http, https, socks5. Để trống = dùng IP máy chủ (dễ bị Google chặn khi tìm nhiều). Proxy lưu theo tài khoản của bạn.
              </p>
            </div>
          </div>
        )}
      </div>
    </form>
  );
};
