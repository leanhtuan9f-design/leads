import { countryCode, countryLabel } from '../utils/country';
import React, { useState, useMemo } from 'react';
import {
  Search,
  Mail,
  Phone,
  Star,
  ArrowUpDown,
  FileSpreadsheet,
  Copy,
  Send,
  Download,
  ChevronDown,
  Code,
  Check,
  X
} from 'lucide-react';
import { ScrapedBusiness } from '../types/scraper';
import { exportToCsv, exportToJson, exportForCrm, copyToClipboardTsv } from '../services/exporter';

interface DataTableProps {
  businesses: ScrapedBusiness[];
  onSelectBusiness: (business: ScrapedBusiness) => void;
  onOpenOutreachModal: (selected: ScrapedBusiness[]) => void;
}

type FilterType = 'all' | 'phone' | 'email' | 'unclaimed';
type SortField = 'rating' | 'reviewsCount' | 'leadScore' | 'title';

const EXPORT_HOVER: Record<string, string> = {
  blue: 'hover:border-blue-500', slate: 'hover:border-slate-500', emerald: 'hover:border-emerald-500', purple: 'hover:border-purple-500'
};
const EXPORT_ICON: Record<string, string> = {
  blue: 'bg-blue-600/20 text-blue-400', slate: 'bg-slate-800 text-slate-300', emerald: 'bg-emerald-600/20 text-emerald-400', purple: 'bg-purple-600/20 text-purple-400'
};

const FILTERS: { id: FilterType; label: string; title?: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'phone', label: 'Có SĐT' },
  { id: 'email', label: 'Có email' },
  { id: 'unclaimed', label: 'Chưa xác minh', title: 'Doanh nghiệp chưa xác minh trên Google Maps' }
];

export const DataTable: React.FC<DataTableProps> = ({
  businesses,
  onSelectBusiness,
  onOpenOutreachModal
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [countryFilter, setCountryFilter] = useState(''); // mã ISO; '' = mọi quốc gia; '?' = chưa xác định
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('leadScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Quốc gia từng lead + danh sách để lọc (nhiều lead nhất lên trước)
  const codeById = useMemo(() => new Map(businesses.map(b => [b.id, countryCode(b)])), [businesses]);
  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const code of codeById.values()) counts.set(code, (counts.get(code) || 0) + 1);
    const unknown = counts.get('') || 0;
    counts.delete('');
    const list = [...counts.entries()].map(([code, n]) => ({ code, n, label: countryLabel(code) })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    return { list, unknown };
  }, [codeById]);
  // Quốc gia đang lọc không còn lead nào (ví dụ vừa xóa) thì quay về 'Tất cả'
  const activeCountry = countryFilter && (countryFilter === '?' ? countryOptions.unknown > 0 : countryOptions.list.some(c => c.code === countryFilter)) ? countryFilter : '';

  const filteredBusinesses = useMemo(() => {
    return businesses.filter(b => {
      if (activeCountry) {
        const code = codeById.get(b.id) || '';
        if (activeCountry === '?' ? code !== '' : code !== activeCountry) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          b.title.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          b.city.toLowerCase().includes(q) ||
          b.state.toLowerCase().includes(q) ||
          b.email.toLowerCase().includes(q) ||
          b.phone.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (filterType === 'email' && !b.email) return false;
      if (filterType === 'phone' && !b.phone) return false;
      if (filterType === 'unclaimed' && b.isClaimed) return false;

      return true;
    }).sort((a, b) => {
      const valA: any = a[sortField];
      const valB: any = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [businesses, codeById, activeCountry, searchQuery, filterType, sortField, sortAsc]);

  const isAllSelected = filteredBusinesses.length > 0 && filteredBusinesses.every(b => selectedIds.has(b.id));
  const toggleSelectAll = () => {
    setSelectedIds(isAllSelected ? new Set() : new Set(filteredBusinesses.map(b => b.id)));
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const selectedBusinesses = useMemo(
    () => businesses.filter(b => selectedIds.has(b.id)),
    [businesses, selectedIds]
  );

  // Xuất phần đã chọn; không chọn gì thì xuất các dòng đang hiển thị (sau khi lọc)
  const exportTarget = selectedBusinesses.length > 0 ? selectedBusinesses : filteredBusinesses;
  const runExport = (fn: () => void) => { fn(); setExportOpen(false); };

  const handleCopy = async () => {
    if (await copyToClipboardTsv(exportTarget)) {
      setCopied(true);
      setTimeout(() => { setCopied(false); setExportOpen(false); }, 1500);
    }
  };

  const sortableTh = (field: SortField, label: string, extra = '') => (
    <th
      onClick={() => handleSort(field)}
      className={`py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors ${extra}`}
    >
      <div className={`flex items-center gap-1 ${extra.includes('text-right') ? 'justify-end' : ''}`}>
        <span>{label}</span>
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-blue-400' : 'text-slate-500'}`} />
      </div>
    </th>
  );

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg flex flex-col">
      {/* Thanh công cụ: tìm, lọc, xuất */}
      <div className="p-3 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Lọc theo tên, SĐT, email, địa chỉ…"
              className="w-full bg-slate-900 border border-slate-700 rounded-md pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2 text-slate-500 hover:text-slate-300" aria-label="Xóa bộ lọc tìm kiếm">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-md border border-slate-800 text-[11px] overflow-x-auto max-w-full">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                title={f.title}
                className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                  filterType === f.id ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}{f.id === 'all' ? ` (${businesses.length})` : ''}
              </button>
            ))}
          </div>

          {(countryOptions.list.length > 0) && (
            <select
              value={activeCountry}
              onChange={(e) => setCountryFilter(e.target.value)}
              aria-label="Lọc theo quốc gia"
              className={`bg-slate-900 border rounded-md px-2 py-1.5 text-[11px] focus:outline-none focus:border-blue-500 max-w-[11rem] ${activeCountry ? 'border-blue-500 text-white' : 'border-slate-800 text-slate-300'}`}
            >
              <option value="">Mọi quốc gia ({businesses.length})</option>
              {countryOptions.list.map(c => <option key={c.code} value={c.code}>{c.label} ({c.n})</option>)}
              {countryOptions.unknown > 0 && <option value="?">Chưa rõ quốc gia ({countryOptions.unknown})</option>}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedIds.size > 0 && (
            <button
              onClick={() => onOpenOutreachModal(selectedBusinesses)}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Send className="w-3 h-3" />
              <span>Soạn email ({selectedIds.size})</span>
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={exportTarget.length === 0}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 border border-slate-700 rounded-md text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap"
              aria-expanded={exportOpen}
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Xuất ({exportTarget.length})</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-[22rem] max-w-[calc(100vw-1.5rem)] bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-40 p-2 space-y-1.5 text-xs">
                  <div className="px-1.5 pt-1 pb-0.5 text-[11px] text-slate-400">
                    {selectedBusinesses.length > 0 ? 'Xuất các dòng đã chọn' : 'Xuất các dòng đang hiển thị'}:{' '}
                    <span className="font-mono text-white font-semibold tabular-nums">{exportTarget.length}</span> lead
                  </div>
                  {[
                    {
                      key: 'csv', icon: <FileSpreadsheet className="w-4 h-4" />, color: 'blue', tag: '.csv',
                      title: 'File CSV đầy đủ (33+ cột)',
                      desc: 'Tên, SĐT, email, địa chỉ, tọa độ GPS, xếp hạng sao… Mở trực tiếp bằng Excel và Google Sheets.',
                      run: () => runExport(() => exportToCsv(exportTarget, `leads_${Date.now()}.csv`))
                    },
                    {
                      key: 'tsv', icon: copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />, color: 'slate', tag: 'Dán vào Sheets',
                      title: copied ? 'Đã sao chép vào bộ nhớ tạm!' : 'Sao chép vào Clipboard',
                      desc: 'Mở Google Sheets hoặc Excel trống, bấm Ctrl+V (Cmd+V) để dán thành các cột ngay, không cần tải file.',
                      run: handleCopy
                    },
                    {
                      key: 'crm', icon: <Send className="w-4 h-4" />, color: 'emerald', tag: 'Instantly / Apollo',
                      title: 'CSV cho CRM & gửi email hàng loạt',
                      desc: 'Tên cột chuẩn quốc tế (Company, Email, Phone, Website, City, Rating) để nhập thẳng vào công cụ gửi thư.',
                      run: () => runExport(() => exportForCrm(exportTarget, `crm_leads_${Date.now()}.csv`))
                    },
                    {
                      key: 'json', icon: <Code className="w-4 h-4" />, color: 'purple', tag: '.json',
                      title: 'JSON đầy đủ trường',
                      desc: 'Mảng đối tượng có danh mục con, mạng xã hội… phù hợp để nạp vào cơ sở dữ liệu hoặc lập trình.',
                      run: () => runExport(() => exportToJson(exportTarget, `leads_${Date.now()}.json`))
                    }
                  ].map(o => (
                    <button
                      key={o.key}
                      onClick={o.run}
                      className={`w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-left transition-colors flex items-start gap-2.5 group ${EXPORT_HOVER[o.color]}`}
                    >
                      <div className={`p-1.5 rounded shrink-0 ${EXPORT_ICON[o.color]}`}>{o.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 font-semibold text-white">
                          <span>{o.title}</span>
                          <span className="text-[10px] font-mono font-normal text-slate-400 shrink-0">{o.tag}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{o.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bảng */}
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-medium text-slate-400">
              <th className="py-2.5 px-3 w-8">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  aria-label="Chọn tất cả"
                  className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                />
              </th>
              {sortableTh('title', 'Doanh nghiệp')}
              <th className="py-2.5 px-3">Liên hệ</th>
              <th className="py-2.5 px-3">Địa chỉ</th>
              {sortableTh('rating', 'Đánh giá')}
              {sortableTh('leadScore', 'Điểm', 'text-right')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filteredBusinesses.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Search className="w-6 h-6 text-slate-600" />
                    {businesses.length === 0 ? (
                      <>
                        <p className="text-sm font-medium text-slate-300">Chưa có lead nào</p>
                        <p className="text-xs text-slate-500">Nhập ngành nghề và khu vực ở trên rồi bấm “Tìm lead”.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-300">Không có lead phù hợp bộ lọc</p>
                        <button
                          onClick={() => { setSearchQuery(''); setFilterType('all'); setCountryFilter(''); }}
                          className="mt-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors"
                        >
                          Xóa bộ lọc
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredBusinesses.map((biz) => {
                const isSelected = selectedIds.has(biz.id);

                return (
                  <tr
                    key={biz.id}
                    onClick={() => onSelectBusiness(biz)}
                    className={`hover:bg-slate-900/70 cursor-pointer transition-colors ${isSelected ? 'bg-blue-950/20' : ''}`}
                  >
                    <td className="py-2.5 px-3" onClick={(e) => toggleSelectOne(biz.id, e)}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`Chọn ${biz.title}`}
                        className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    <td className="py-2.5 px-3 max-w-[280px]">
                      <div className="font-semibold text-slate-100 truncate">{biz.title}</div>
                      <div className="text-[11px] text-blue-400 truncate mt-0.5">{biz.category}</div>
                    </td>

                    {/* Liên hệ: SĐT trước, email sau */}
                    <td className="py-2.5 px-3">
                      <div className="space-y-0.5 text-[11px] font-mono">
                        {biz.phone ? (
                          <div className="flex items-center gap-1.5 text-slate-200">
                            <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                            <a href={`tel:${biz.phone}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{biz.phone}</a>
                          </div>
                        ) : (
                          <div className="text-slate-500 italic font-sans">Không có SĐT</div>
                        )}
                        {biz.email ? (
                          <div className="flex items-center gap-1.5 text-slate-300 truncate max-w-[200px]">
                            <Mail className="w-3 h-3 text-blue-400 shrink-0" />
                            <a href={`mailto:${biz.email}`} onClick={(e) => e.stopPropagation()} className="hover:underline truncate">{biz.email}</a>
                          </div>
                        ) : (
                          <div className="text-slate-500 italic font-sans">Chưa có email</div>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="text-slate-200">{biz.city}{biz.state ? `, ${biz.state}` : ''}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[170px]" title={biz.street}>{biz.street}</div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1 font-mono tabular-nums text-slate-100 font-medium">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{biz.rating.toFixed(1)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">{biz.reviewsCount} đánh giá</div>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <div className="font-mono font-semibold tabular-nums text-slate-100">{biz.leadScore}</div>
                      <div className="text-[10px] font-medium">
                        {biz.leadStatus === 'hot' && <span className="text-rose-400">Điểm hồ sơ cao</span>}
                        {biz.leadStatus === 'warm' && <span className="text-amber-400">Điểm trung bình</span>}
                        {biz.leadStatus === 'cold' && <span className="text-slate-500">Bình thường</span>}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between bg-slate-900/40">
        <div>
          <span className="font-mono text-slate-200 tabular-nums">{filteredBusinesses.length}</span> / <span className="font-mono text-slate-200 tabular-nums">{businesses.length}</span> lead
        </div>
        <div className="text-[11px] text-slate-500 hidden sm:block">Bấm vào một dòng để xem chi tiết (website, xác minh, bản đồ)</div>
      </div>
    </div>
  );
};
