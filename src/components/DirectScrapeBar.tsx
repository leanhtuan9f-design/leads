import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { COUNTRIES } from '../data/countries';
import { Search, MapPin, Briefcase, ChevronRight, Sparkles, Globe, Package } from 'lucide-react';
import { ScraperOptions, ScrapedBusiness } from '../types/scraper';
import { Quota, apiJson } from '../auth/types';
import { citiesFor } from '../data/cities';
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
  isAdmin?: boolean;
}

interface AiCountry { country: string; keywords: string[]; reason: string }
interface BuyerType { name: string; keyword: string }
interface MarketCity { city: string; logisticsScore: number; logisticsReason: string; verifiedHub: boolean; port?: string; airport?: string; lat?: number; lon?: number; source?: string }
interface MarketRecommendation { country: string; cities: MarketCity[]; tradeData: { status: string; source: string | null; year: number | null; exportValueUsd: number | null; hsCodes: string[] } }
interface MarketRecommendations { classification: { name: string; hs: string[]; confidence: string; source: string }; markets: MarketRecommendation[]; tradeDataStatus: string }
interface TradeMarket { country: string; exportValueUsd: number; growthRate: number | null; share: number; period: string; score: number }
interface TradeData { status: string; classification?: { name: string; hs: string[]; confidence: string }; markets: TradeMarket[] }
interface ExportMarkets { status: string; period?: string | null; markets: TradeMarket[] }
interface AiState {
  buyerTypes?: BuyerType[];
  enabled: boolean;
  hasProfile: boolean;
  profileOffer?: string;
  used: number;
  limit: number;
  countries: AiCountry[];
  recommendations?: MarketRecommendations | null;
  tradeData?: TradeData;
  exportMarkets?: ExportMarkets;
  stale: boolean;
}

const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Giá trị đặc biệt của ô "Số lượng": lấy tối đa có thể (chế độ exhaustive)
const FULL_BATCH = 0;

export const DirectScrapeBar: React.FC<DirectScrapeBarProps> = ({
  existingBusinesses = [],
  onStartScrape,
  isRunning,
  proxiesText,
  onChangeProxies,
  proxyCount = 0,
  quota = null,
  profileVersion = 0,
  onOpenProfile,
  isAdmin = false
}) => {
  const [product, setProduct] = useState(() => (new URLSearchParams(window.location.search).get('product') || '').slice(0, 600)); // sản phẩm xuất khẩu — AI dựa vào đây để gợi ý
  const [aiProduct, setAiProduct] = useState(''); // sản phẩm mà danh sách gợi ý hiện tại được tạo cho
  const [category, setCategory] = useState(() => (new URLSearchParams(window.location.search).get('keyword') || '').slice(0, 200));
  const [country, setCountry] = useState(() => (new URLSearchParams(window.location.search).get('country') || '').slice(0, 100));
  const [city, setCity] = useState(''); // thành phố / khu vực trong quốc gia
  const [maxResults, setMaxResults] = useState(25);
  const [showOptions, setShowOptions] = useState(false);
  const [skipWithoutPhone, setSkipWithoutPhone] = useState(false);
  const [skipWithoutWebsite, setSkipWithoutWebsite] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  // Gợi ý từ khóa bằng AI dựa trên Hồ sơ
  const [ai, setAi] = useState<AiState | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const loadAi = useCallback(() => {
    apiJson<AiState>('/suggest')
      .then(r => {
        setAi(r);
        // lần đầu: điền sẵn sản phẩm từ Hồ sơ (nếu có) và hiện luôn gợi ý đã lưu
        setProduct(prev => prev || r.profileOffer || '');
        if (r.countries.length) setAiProduct(r.profileOffer || '');
      })
      .catch(() => setAi(null));
  }, []);
  useEffect(() => { loadAi(); }, [loadAi, profileVersion]);

  // Một lần gọi AI: danh sách quốc gia + từ khóa. Chọn nước xong, từ khóa và thành phố hiện ngay (không gọi AI nữa).
  const askAi = async () => {
    setAiBusy(true);
    setAiError('');
    try {
      const r = await apiJson<{ countries: AiCountry[]; buyerTypes: BuyerType[]; recommendations: MarketRecommendations; tradeData: TradeData; exportMarkets: ExportMarkets; used: number; limit: number }>('/suggest', 'POST', { product: product.trim() });
      setAi(prev => (prev ? { ...prev, countries: r.countries, buyerTypes: r.buyerTypes, recommendations: r.recommendations, tradeData: r.tradeData, exportMarkets: r.exportMarkets, used: r.used, limit: r.limit, stale: false } : prev));
      setAiProduct(product.trim());
      setCountry('');
      setCity('');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Không lấy được gợi ý');
      loadAi();
    } finally {
      setAiBusy(false);
    }
  };

  const chooseCountry = (name: string) => {
    setCountry(name);
    setCity('');
    setAiError('');
    const kw = ai?.countries.find(c => c.country.toLowerCase() === name.toLowerCase())?.keywords[0];
    if (kw && !category.trim()) setCategory(kw);
  };

  const countryInfo = ai && country.trim() ? ai.countries.find(c => c.country.toLowerCase() === country.trim().toLowerCase()) : undefined;
  const marketInfo = ai?.recommendations?.markets.find(m => m.country.toLowerCase() === country.trim().toLowerCase());
  const cityOptions = marketInfo?.cities?.map(c => c.city) || (country.trim() ? citiesFor(country) : []);

  // Địa điểm gửi đi: "Thành phố, Quốc gia" (bỏ trùng nếu thành phố đã có tên nước)
  const fullLocation = (() => {
    const c = city.trim(), n = country.trim();
    if (!n) return c;
    if (!c) return n;
    return new RegExp(`(^|,\\s*)${escRe(n)}$`, 'i').test(c) ? c : `${c}, ${n}`;
  })();

  // Số lượng dùng cho "Tất cả có thể": ước lượng thị trường trừ số đã có (heuristic)
  const fullTarget = useMemo(() => {
    if (!category.trim() || !fullLocation) return 100;
    const normCat = category.toLowerCase().trim();
    const have = existingBusinesses.filter(b =>
      (b.category && b.category.toLowerCase().includes(normCat)) ||
      (b.title && b.title.toLowerCase().includes(normCat))
    ).length;
    const remaining = estimateMarketTotal(category, fullLocation) - have;
    return remaining > 0 ? remaining : 100;
  }, [category, fullLocation, existingBusinesses]);

  // Gói giới hạn 1 quốc gia: nước đã khoá lúc mua gói thì cố định, không đổi trên ô nhập
  // Gói giới hạn quốc gia: nước đã mua/khoá là cố định (1 nước: ô khoá; nhiều nước: chỉ chọn trong danh sách đã mua)
  const allowedCountries = quota?.maxCountries && quota.countries && quota.countries.length >= quota.maxCountries ? quota.countries : [];
  const lockedCountry = allowedCountries.length === 1 ? allowedCountries[0] : '';
  const pickFromAllowed = allowedCountries.length > 1;
  useEffect(() => { if (lockedCountry && country !== lockedCountry) setCountry(lockedCountry); }, [lockedCountry, country]);
  useEffect(() => { if (pickFromAllowed && !allowedCountries.some(c => c.toLowerCase() === country.trim().toLowerCase())) setCountry(allowedCountries[0]); }, [pickFromAllowed, allowedCountries.join('|'), country]);
  const quotaFull = quota ? quota.newUsed >= quota.newLimit : false;
  const canSubmit = !isRunning && category.trim() !== '' && fullLocation !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const isFull = maxResults === FULL_BATCH;

    onStartScrape({
      query: `${category.trim()} tại ${fullLocation}`,
      category: category.trim(),
      location: fullLocation,
      country: country.trim(),
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
      {ai?.enabled && (
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Package className="w-4 h-4 absolute left-3 top-3 text-amber-300 pointer-events-none" />
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (product.trim() && !aiBusy) askAi(); } }}
              placeholder="Sản phẩm của bạn (vd: cà phê rang xay, hạt điều, gạo ST25) — nhập xong AI sẽ gợi ý thị trường và từ khóa"
              aria-label="Sản phẩm"
              maxLength={600}
              className={`${inputCls} pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={() => askAi()}
            disabled={aiBusy || !product.trim() || ai.used >= ai.limit}
            className="py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            <span>{aiBusy ? 'AI đang nghĩ…' : 'AI gợi ý'}</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
        <div className="md:col-span-3 relative">
          <Briefcase className="w-4 h-4 absolute left-3 top-3 text-blue-400 pointer-events-none" />
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Loại khách hàng (vd: coffee importer)"
            aria-label="Ngành nghề"
            className={`${inputCls} pl-9`}
          />
        </div>

        <div className="md:col-span-2 relative">
          <Globe className="w-4 h-4 absolute left-3 top-3 text-amber-300 pointer-events-none" />
          {pickFromAllowed ? <select
            value={country}
            onChange={(e) => { setCountry(e.target.value); setCity(''); }}
            aria-label="Quốc gia"
            title="Bạn chỉ tìm kiếm trong các quốc gia đã mua. Mua thêm quốc gia ở bảng gói dịch vụ."
            className={`${inputCls} pl-9`}
          >{allowedCountries.map(c => <option key={c} value={c}>{c}</option>)}</select> : <input
            type="text"
            list="country-list"
            value={country}
            readOnly={Boolean(lockedCountry)}
            title={lockedCountry ? 'Gói Căn bản chỉ tìm trong quốc gia đã chọn khi mua. Mua thêm quốc gia hoặc nâng cấp gói Nâng cao để tìm nhiều nước.' : undefined}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Quốc gia"
            aria-label="Quốc gia"
            className={`${inputCls} pl-9`}
            autoComplete="off"
          />}
          <datalist id="country-list">{COUNTRIES.map(c => <option key={c} value={c} />)}</datalist>
        </div>

        <div className="md:col-span-3 relative">
          <MapPin className="w-4 h-4 absolute left-3 top-3 text-emerald-400 pointer-events-none" />
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={country.trim() ? 'Thành phố / quận (tự điền, nhỏ hơn càng sát)' : 'Thành phố / khu vực (vd: Osaka)'}
            aria-label="Thành phố hoặc khu vực"
            list="city-list"
            autoComplete="off"
            className={`${inputCls} pl-9`}
          />
          <datalist id="city-list">{cityOptions.map(c => <option key={c} value={c} />)}</datalist>
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
            {ai.countries.length === 0 ? (
              <>
                <span className="text-slate-300 font-medium">Gợi ý cho bạn:</span>
                <span className="text-slate-400">
                  {product.trim() ? 'Bấm “AI gợi ý” để xem thị trường và từ khóa nên tìm' : 'Nhập sản phẩm ở ô trên, AI sẽ gợi ý thị trường và từ khóa để bạn bấm chọn'}
                </span>
              </>
            ) : !country.trim() ? (
              <>
                <span className="text-slate-300 font-medium">Thị trường nên tìm{aiProduct ? ` cho “${aiProduct}”` : ''}:</span>
                {ai.countries.map((c) => (
                  <button
                    key={c.country}
                    type="button"
                    title={`${c.reason}${c.keywords.length ? ` — Từ khóa: ${c.keywords.join(', ')}` : ''}`}
                    onClick={() => chooseCountry(c.country)}
                    disabled={aiBusy}
                    className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded transition-colors disabled:opacity-50"
                  >
                    {c.country}
                  </button>
                ))}
                {ai.tradeData?.status === 'loaded' && (
                  <div className="basis-full mt-1 text-[10px] text-emerald-300/80">
                    Xếp hạng theo dữ liệu xuất khẩu {ai.tradeData.classification?.name || product.trim()} ({ai.tradeData.markets[0]?.period}): {ai.tradeData.markets.slice(0, 3).map((m, i) => `${i + 1}. ${m.country} ${Math.round(m.share)}%${m.growthRate === null ? '' : ` (${m.growthRate > 0 ? '+' : ''}${m.growthRate}%)`}`).join(' · ')}
                  </div>
                )}
                {ai.exportMarkets?.status === 'loaded' && (
                  <div className="basis-full mt-1 text-[10px] text-sky-300/80">
                    Việt Nam đang có kim ngạch xuất khẩu tại {ai.exportMarkets.markets.length} quốc gia/vùng lãnh thổ ({ai.exportMarkets.period}): {ai.exportMarkets.markets.slice(0, 8).map((m) => m.country).join(' · ')}
                  </div>
                )}
                {product.trim() && aiProduct !== product.trim() && (
                  <span className="text-amber-300">Sản phẩm đã đổi — bấm “AI gợi ý” để cập nhật.</span>
                )}
                <span className="text-slate-500">hoặc tự nhập ô Quốc gia</span>
              </>
            ) : (
              <>
                <span className="text-slate-300 font-medium">{country.trim()}:</span>
                {countryInfo && (
                  <>
                    <span className="text-slate-500">Từ khóa</span>
                    {countryInfo.keywords.map((k) => (
                      <button
                        key={k}
                        type="button"
                        title={countryInfo.reason}
                        onClick={() => setCategory(k)}
                        className={`px-2 py-0.5 border rounded transition-colors ${category === k ? 'bg-amber-500/30 border-amber-400 text-white' : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-200'}`}
                      >
                        {k}
                      </button>
                    ))}
                  </>
                )}
                {cityOptions.length > 0 && (
                  <>
                    <span className="text-slate-500 ml-1">Thành phố</span>
                    {cityOptions.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCity(c)}
                        className={`px-2 py-0.5 border rounded font-mono transition-colors ${city === c ? 'bg-emerald-500/30 border-emerald-400 text-white' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-emerald-300'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </>
                )}
                {marketInfo && (
                  <div className="basis-full mt-1 text-[10px] text-slate-500">
                    Ưu tiên logistics: {marketInfo.cities.slice(0, 3).map((c, i) => `${i + 1}. ${c.city} (${c.logisticsScore}/100${c.port ? ` · ${c.port}` : ''}${c.airport ? ` · ${c.airport}` : ''})`).join(' · ')}
                    {ai?.recommendations?.tradeDataStatus === 'not_loaded' && ' · Dữ liệu hải quan đang chờ nạp snapshot chính thức'}
                  </div>
                )}
                <button type="button" onClick={() => { setCountry(''); setCity(''); }} className="text-slate-400 hover:text-white underline">Chọn nước khác</button>
              </>
            )}
            <span className="text-slate-500">({ai.used}/{ai.limit} lượt hôm nay)</span>
          </div>
          {(ai.buyerTypes?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <Briefcase className="w-3.5 h-3.5 text-blue-300" />
              <span className="text-slate-300 font-medium">Loại khách hàng phù hợp:</span>
              {ai.buyerTypes!.map((b) => (
                <button
                  key={b.keyword}
                  type="button"
                  title={`Từ khóa tìm: ${b.keyword}`}
                  onClick={() => setCategory(b.keyword)}
                  className={`px-2 py-0.5 border rounded transition-colors ${category === b.keyword ? 'bg-blue-500/30 border-blue-400 text-white' : 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-200'}`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
          {aiBusy && <div className="text-[11px] text-slate-400">AI đang phân tích…</div>}
          {aiError && <div className="text-xs text-red-300">{aiError}</div>}
        </div>
      )}

      {isAdmin && (
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
      )}
    </form>
  );
};
