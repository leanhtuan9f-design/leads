import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, MapPin, Briefcase, ChevronRight, Sparkles } from 'lucide-react';
import { ScraperOptions, ScrapedBusiness } from '../types/scraper';
import { Quota, apiJson } from '../auth/types';
import { estimateMarketTotal } from '../services/scraperEngine';

interface DirectScrapeBarProps {
  existingBusinesses?: ScrapedBusiness[];
  onStartScrape: (options: ScraperOptions) => void;
  isRunning: boolean;
  proxiesText: string;
  onChangeProxies: (text: string) => void;
  proxyCount?: number;
  quota?: Quota | null;
  profileVersion?: number;
  onOpenProfile: () => void;
}

interface AiSuggestion { category: string; location: string; reason: string }
interface AiState {
  enabled: boolean;
  hasProfile: boolean;
  used: number;
  limit: number;
  items: AiSuggestion[];
  stale: boolean;
}

// Giá trị đặc biệt của ô "Số lượng": lấy tối đa có thể (chế độ exhaustive)
const FULL_BATCH = 0;

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
  proxiesText,
  onChangeProxies,
  proxyCount = 0,
  quota = null,
  profileVersion = 0,
  onOpenProfile
}) => {
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [maxResults, setMaxResults] = useState(25);
  const [showOptions, setShowOptions] = useState(false);
  const [skipWithoutPhone, setSkipWithoutPhone] = useState(false);
  const [skipWithoutWebsite, setSkipWithoutWebsite] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  // Gợi ý từ khóa bằng AI dựa trên Hồ sơ
  const [ai, setAi] = useState<AiState | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showSamples, setShowSamples] = useState(false);

  const loadAi = useCallback(() => {
    apiJson<AiState>('/suggest').then(setAi).catch(() => setAi(null));
  }, []);
  useEffect(() => { loadAi(); }, [loadAi, profileVersion]);

  const askAi = async () => {
    setAiBusy(true);
    setAiError('');
    try {
      const r = await apiJson<{ items: AiSuggestion[]; used: number; limit: number }>('/suggest', 'POST', {});
      setAi(prev => (prev ? { ...prev, items: r.items, used: r.used, limit: r.limit, stale: false } : prev));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Không lấy được gợi ý');
      loadAi();
    } finally {
      setAiBusy(false);
    }
  };

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

      {ai?.enabled && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-slate-300 font-medium">Gợi ý cho bạn:</span>
            {!ai.hasProfile ? (
              <button type="button" onClick={onOpenProfile} className="text-blue-400 hover:text-blue-300 underline">
                Điền Hồ sơ để AI gợi ý ngành và khu vực nên tìm
              </button>
            ) : (
              <>
                {ai.items.map((it) => (
                  <button
                    key={`${it.category}|${it.location}`}
                    type="button"
                    title={it.reason}
                    onClick={() => { setCategory(it.category); setLocation(it.location); }}
                    className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-slate-200 border border-amber-500/30 rounded transition-colors"
                  >
                    <span className="text-amber-300">{it.category}</span>
                    <span className="text-slate-500 mx-1">@</span>
                    <span className="font-mono text-emerald-400">{it.location}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={askAi}
                  disabled={aiBusy || ai.used >= ai.limit}
                  className="px-2 py-0.5 text-blue-300 hover:text-white border border-blue-500/40 hover:bg-blue-600/30 disabled:opacity-50 rounded transition-colors"
                >
                  {aiBusy ? 'AI đang nghĩ…' : ai.items.length ? (ai.stale ? 'Cập nhật theo hồ sơ mới' : 'Gợi ý lại') : 'Gợi ý từ hồ sơ của tôi'}
                </button>
                <span className="text-slate-500">({ai.used}/{ai.limit} lượt hôm nay)</span>
                <button type="button" onClick={onOpenProfile} className="text-slate-400 hover:text-white underline">Sửa hồ sơ</button>
              </>
            )}
            {ai.items.length > 0 && (
              <button type="button" onClick={() => setShowSamples(v => !v)} className="text-slate-500 hover:text-slate-300 underline ml-auto">
                {showSamples ? 'Ẩn gợi ý mẫu' : 'Gợi ý mẫu'}
              </button>
            )}
          </div>
          {aiError && <div className="text-xs text-red-300">{aiError}</div>}
        </div>
      )}

      {(!ai?.enabled || !ai.hasProfile || ai.items.length === 0 || showSamples) && (
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-slate-400 font-medium">Gợi ý mẫu nhanh:</span>
        {QUICK_SEARCH_EXAMPLES.map((ex) => (
          <button
            key={ex.category}
            type="button"
            onClick={() => { setCategory(ex.category); setLocation(ex.location); }}
            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded transition-colors"
          >
            <span className="text-blue-400">{ex.category}</span>
            <span className="text-slate-500 mx-1">@</span>
            <span className="font-mono text-emerald-400">{ex.location}</span>
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
