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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('leadScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const filteredBusinesses = useMemo(() => {
    return businesses.filter(b => {
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
  }, [businesses, searchQuery, filterType, sortField, sortAsc]);

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
                <div className="absolute right-0 mt-1.5 w-60 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-40 py-1 text-xs">
                  <button onClick={() => runExport(() => exportToCsv(exportTarget, `leads_${Date.now()}.csv`))} className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-slate-200">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" /> Tải file CSV (Excel, Sheets)
                  </button>
                  <button onClick={handleCopy} className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-slate-200">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    {copied ? 'Đã sao chép — dán vào Sheets' : 'Sao chép để dán vào Sheets'}
                  </button>
                  <button onClick={() => runExport(() => exportForCrm(exportTarget, `crm_leads_${Date.now()}.csv`))} className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-slate-200">
                    <Send className="w-3.5 h-3.5 text-emerald-400" /> CSV cho CRM / gửi email hàng loạt
                  </button>
                  <button onClick={() => runExport(() => exportToJson(exportTarget, `leads_${Date.now()}.json`))} className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-slate-200">
                    <Code className="w-3.5 h-3.5 text-purple-400" /> JSON (cho lập trình)
                  </button>
                  <div className="px-3 pt-1.5 pb-1 text-[10px] text-slate-500 border-t border-slate-800 mt-1">
                    {selectedBusinesses.length > 0 ? 'Chỉ xuất các dòng đã chọn' : 'Xuất các dòng đang hiển thị'}
                  </div>
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
                          onClick={() => { setSearchQuery(''); setFilterType('all'); }}
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
                        {biz.leadStatus === 'hot' && <span className="text-rose-400">Tiềm năng cao</span>}
                        {biz.leadStatus === 'warm' && <span className="text-amber-400">Tiềm năng</span>}
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
