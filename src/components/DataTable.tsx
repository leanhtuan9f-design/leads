import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Mail, 
  Phone, 
  Globe, 
  Star, 
  MapPin, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  ArrowUpDown, 
  FileSpreadsheet, 
  Copy, 
  Send,
  Eye,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { ScrapedBusiness, FilterOptions } from '../types/scraper';
import { exportToCsv, copyToClipboardTsv } from '../services/exporter';
import { HelpButton } from './HelpButton';

interface DataTableProps {
  businesses: ScrapedBusiness[];
  onSelectBusiness: (business: ScrapedBusiness) => void;
  onOpenOutreachModal: (selected: ScrapedBusiness[]) => void;
  onOpenGuide: (guideId: string) => void;
}

export const DataTable: React.FC<DataTableProps> = ({
  businesses,
  onSelectBusiness,
  onOpenOutreachModal,
  onOpenGuide
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'email' | 'phone' | 'website' | 'unclaimed' | 'hot' | 'top_rated'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'rating' | 'reviewsCount' | 'leadScore' | 'title'>('leadScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Filter logic
  const filteredBusinesses = useMemo(() => {
    return businesses.filter(b => {
      // Text search
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

      // Filter segmented buttons
      if (filterType === 'email' && !b.email) return false;
      if (filterType === 'phone' && !b.phone) return false;
      if (filterType === 'website' && !b.website) return false;
      if (filterType === 'unclaimed' && b.isClaimed) return false;
      if (filterType === 'hot' && b.leadStatus !== 'hot') return false;
      if (filterType === 'top_rated' && b.rating < 4.7) return false;

      return true;
    }).sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [businesses, searchQuery, filterType, sortField, sortAsc]);

  // Bulk selection handling
  const isAllSelected = filteredBusinesses.length > 0 && filteredBusinesses.every(b => selectedIds.has(b.id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBusinesses.map(b => b.id)));
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSort = (field: 'rating' | 'reviewsCount' | 'leadScore' | 'title') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const selectedBusinesses = useMemo(() => {
    return businesses.filter(b => selectedIds.has(b.id));
  }, [businesses, selectedIds]);

  const handleExportSelectedCsv = () => {
    const toExport = selectedBusinesses.length > 0 ? selectedBusinesses : filteredBusinesses;
    exportToCsv(toExport, `gmaps_leads_${Date.now()}.csv`);
  };

  const handleCopyClipboard = async () => {
    const toCopy = selectedBusinesses.length > 0 ? selectedBusinesses : filteredBusinesses;
    const ok = await copyToClipboardTsv(toCopy);
    if (ok) {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
      {/* Search & Filter Toolbar */}
      <div className="p-3.5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Quick Search */}
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Lọc theo tên, điện thoại, email, địa chỉ..."
              className="w-full bg-slate-900 border border-slate-700 rounded-md pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Segmented Filter Buttons (Việt hoá) */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-md border border-slate-800 text-[11px] overflow-x-auto">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                filterType === 'all' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tất cả ({businesses.length})
            </button>
            <button
              onClick={() => setFilterType('email')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                filterType === 'email' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Có Email
            </button>
            <button
              onClick={() => setFilterType('phone')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                filterType === 'phone' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Có SĐT
            </button>
            <button
              onClick={() => setFilterType('unclaimed')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                filterType === 'unclaimed' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Doanh nghiệp chưa xác minh trên Google Maps"
            >
              Chưa xác minh
            </button>
            <button
              onClick={() => setFilterType('hot')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                filterType === 'hot' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Khách hàng tiềm năng cao (Lead Score >= 85)"
            >
              Hot Leads
            </button>
          </div>

          <HelpButton guideId="data_table" onOpenGuide={onOpenGuide} tooltipText="Xem giải thích bộ lọc & cách tính Lead Score" />
        </div>

        {/* Action Controls for Selected */}
        <div className="flex items-center gap-2 shrink-0">
          {selectedIds.size > 0 && (
            <button
              onClick={() => onOpenOutreachModal(selectedBusinesses)}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Send className="w-3 h-3" />
              <span>Gửi Email tiếp cận ({selectedIds.size})</span>
            </button>
          )}

          <button
            onClick={handleCopyClipboard}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-md text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Sao chép định dạng TSV để dán trực tiếp vào Google Sheets"
          >
            <Copy className="w-3 h-3 text-slate-400" />
            <span>{copiedNotification ? 'Đã sao chép TSV!' : 'Sao chép TSV'}</span>
          </button>

          <button
            onClick={handleExportSelectedCsv}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-md text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3 h-3 text-slate-400" />
            <span>Xuất CSV ({selectedIds.size > 0 ? selectedIds.size : filteredBusinesses.length})</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto min-h-[400px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-medium text-slate-400 tracking-wider">
              <th className="py-2.5 px-3 w-8">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                />
              </th>
              <th 
                onClick={() => handleSort('title')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Tên doanh nghiệp & Ngành nghề</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-2.5 px-3">Thông tin liên hệ (Email & SĐT)</th>
              <th className="py-2.5 px-3">Khu vực / Địa chỉ</th>
              <th 
                onClick={() => handleSort('rating')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Đánh giá Google</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-2.5 px-3">Website & Xác minh</th>
              <th 
                onClick={() => handleSort('leadScore')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors text-right"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Điểm tiềm năng</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-2.5 px-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filteredBusinesses.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Search className="w-6 h-6 text-slate-600" />
                    <p className="text-sm font-medium text-slate-300">Không tìm thấy địa điểm kinh doanh phù hợp</p>
                    <p className="text-xs text-slate-500">Hãy thử điều chỉnh từ khóa tìm kiếm hoặc đặt lại các bộ lọc hiện tại</p>
                    <button
                      onClick={() => { setSearchQuery(''); setFilterType('all'); }}
                      className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors"
                    >
                      Đặt lại bộ lọc
                    </button>
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
                    className={`hover:bg-slate-900/70 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-950/20' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-2.5 px-3" onClick={(e) => toggleSelectOne(biz.id, e)}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Business Name & Category */}
                    <td className="py-2.5 px-3 max-w-[280px]">
                      <div className="font-semibold text-slate-100 truncate">{biz.title}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span className="text-blue-400 font-medium">{biz.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{biz.priceLevel}</span>
                      </div>
                    </td>

                    {/* Contact (Email + Phone) */}
                    <td className="py-2.5 px-3">
                      <div className="space-y-0.5">
                        {biz.email ? (
                          <div className="flex items-center gap-1.5 text-slate-200 font-mono text-[11px] truncate max-w-[200px]">
                            <Mail className="w-3 h-3 text-blue-400 shrink-0" />
                            <a 
                              href={`mailto:${biz.email}`} 
                              onClick={(e) => e.stopPropagation()} 
                              className="hover:underline truncate"
                            >
                              {biz.email}
                            </a>
                          </div>
                        ) : (
                          <div className="text-slate-500 text-[11px] italic">Chưa tìm thấy email</div>
                        )}

                        {biz.phone ? (
                          <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]">
                            <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                            <a 
                              href={`tel:${biz.phone}`} 
                              onClick={(e) => e.stopPropagation()} 
                              className="hover:underline"
                            >
                              {biz.phone}
                            </a>
                          </div>
                        ) : (
                          <div className="text-slate-500 text-[11px] italic">Không có SĐT</div>
                        )}
                      </div>
                    </td>

                    {/* Location */}
                    <td className="py-2.5 px-3">
                      <div className="text-slate-200 text-xs">{biz.city}, {biz.state}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[170px]" title={biz.street}>
                        {biz.street}
                      </div>
                    </td>

                    {/* Rating & Reviews */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1 font-mono tabular-nums text-slate-100 font-medium">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{biz.rating.toFixed(1)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                        {biz.reviewsCount} đánh giá
                      </div>
                    </td>

                    {/* Web & Claimed */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {biz.website ? (
                          <a
                            href={biz.website}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px] truncate max-w-[130px]"
                            title={biz.website}
                          >
                            <Globe className="w-3 h-3 shrink-0" />
                            <span className="truncate">{biz.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                          </a>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Chưa có website</span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5 flex items-center gap-1">
                        {biz.isClaimed ? (
                          <span className="text-emerald-400">Đã xác minh</span>
                        ) : (
                          <span className="text-amber-400 font-medium">Chưa xác minh</span>
                        )}
                      </div>
                    </td>

                    {/* Lead Score */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="font-mono font-semibold text-xs tabular-nums text-slate-100">
                        {biz.leadScore}/100
                      </div>
                      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        {biz.leadStatus === 'hot' && <span className="text-rose-400 font-bold">Rất tiềm năng</span>}
                        {biz.leadStatus === 'warm' && <span className="text-amber-400">Tiềm năng</span>}
                        {biz.leadStatus === 'cold' && <span className="text-slate-500">Bình thường</span>}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onSelectBusiness(biz)}
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                          title="Xem chi tiết 33 trường dữ liệu"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={biz.googleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-slate-400 hover:text-blue-400 rounded hover:bg-slate-800 transition-colors"
                          title="Mở trên ứng dụng Google Maps"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2.5 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between bg-slate-900/40">
        <div>
          Đang hiển thị <span className="font-mono text-slate-200 tabular-nums">{filteredBusinesses.length}</span> trên tổng số{' '}
          <span className="font-mono text-slate-200 tabular-nums">{businesses.length}</span> địa điểm đã trích xuất
        </div>
        <div className="text-[11px] text-slate-500">
          Mẹo: Nhấp vào bất kỳ dòng nào để mở hồ sơ chi tiết hoặc gửi email chào hàng
        </div>
      </div>
    </div>
  );
};
