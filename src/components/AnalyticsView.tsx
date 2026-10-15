import React, { useMemo } from 'react';
import { Mail, Phone, Globe, Star, ShieldCheck, AlertCircle, BarChart2, TrendingUp, Building2, MapPin } from 'lucide-react';
import { ScrapedBusiness } from '../types/scraper';
import { HelpButton } from './HelpButton';

interface AnalyticsViewProps {
  businesses: ScrapedBusiness[];
  onOpenOutreachModal: (leads: ScrapedBusiness[]) => void;
  onOpenGuide: (guideId: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  businesses,
  onOpenOutreachModal,
  onOpenGuide
}) => {
  const stats = useMemo(() => {
    const total = businesses.length;
    if (total === 0) return null;

    const withEmail = businesses.filter(b => b.email).length;
    const withPhone = businesses.filter(b => b.phone).length;
    const withWebsite = businesses.filter(b => b.website).length;
    const unclaimed = businesses.filter(b => !b.isClaimed).length;
    const hotLeads = businesses.filter(b => b.leadStatus === 'hot').length;
    const warmLeads = businesses.filter(b => b.leadStatus === 'warm').length;

    const totalReviews = businesses.reduce((acc, b) => acc + b.reviewsCount, 0);
    const avgReviews = Math.round(totalReviews / total);

    const totalRating = businesses.reduce((acc, b) => acc + b.rating, 0);
    const avgRating = (totalRating / total).toFixed(2);

    // Categories count
    const catMap: Record<string, number> = {};
    businesses.forEach(b => {
      catMap[b.category] = (catMap[b.category] || 0) + 1;
    });
    const sortedCategories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    // Cities count
    const cityMap: Record<string, number> = {};
    businesses.forEach(b => {
      const cityKey = `${b.city}, ${b.state}`;
      cityMap[cityKey] = (cityMap[cityKey] || 0) + 1;
    });
    const sortedCities = Object.entries(cityMap).sort((a, b) => b[1] - a[1]);

    return {
      total,
      withEmail,
      emailPct: Math.round((withEmail / total) * 100),
      withPhone,
      phonePct: Math.round((withPhone / total) * 100),
      withWebsite,
      websitePct: Math.round((withWebsite / total) * 100),
      unclaimed,
      unclaimedPct: Math.round((unclaimed / total) * 100),
      hotLeads,
      warmLeads,
      avgReviews,
      avgRating,
      sortedCategories,
      sortedCities
    };
  }, [businesses]);

  if (!stats) return null;

  return (
    <div className="space-y-5 text-xs">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
            <span>Tổng số địa điểm đã cào</span>
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums">
            {stats.total}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Trải rộng trên {stats.sortedCities.length} thị trường địa lý
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
            <span>Tỷ lệ có sẵn Email liên hệ</span>
            <Mail className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-blue-400 tabular-nums">
            {stats.emailPct}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            {stats.withEmail} email đã xác thực
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
            <span>Độ phủ Số điện thoại</span>
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {stats.phonePct}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            {stats.withPhone} số điện thoại sẵn sàng gọi
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
            <span>Chưa xác minh (Cơ hội SEO)</span>
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-amber-400 tabular-nums">
            {stats.unclaimed}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {stats.unclaimedPct}% hồ sơ chưa claim Google Maps
          </div>
        </div>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lead Quality & Conversion Readiness */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Phân loại Chất lượng Khách hàng</h3>
                  <HelpButton guideId="analytics" onOpenGuide={onOpenGuide} tooltipText="Xem cách phân loại Hot/Warm Leads" />
                </div>
                <p className="text-[11px] text-slate-400">Đánh giá theo mức độ đầy đủ của SĐT, Email, Website và cơ hội tối ưu hóa</p>
              </div>
            </div>
            <button
              onClick={() => onOpenOutreachModal(businesses.filter(b => b.leadStatus === 'hot'))}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
            >
              Tiếp cận Hot Leads →
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Khách hàng Rất tiềm năng (Điểm 85–100)</span>
                <span className="font-mono text-white tabular-nums">{stats.hotLeads} ({Math.round((stats.hotLeads / stats.total) * 100)}%)</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full" 
                  style={{ width: `${(stats.hotLeads / stats.total) * 100}%` }} 
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Khách hàng Tiềm năng (Điểm 65–84)</span>
                <span className="font-mono text-white tabular-nums">{stats.warmLeads} ({Math.round((stats.warmLeads / stats.total) * 100)}%)</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-amber-500 h-full rounded-full" 
                  style={{ width: `${(stats.warmLeads / stats.total) * 100}%` }} 
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Listing Cơ bản / Cần bổ sung thông tin</span>
                <span className="font-mono text-white tabular-nums">{stats.total - stats.hotLeads - stats.warmLeads}</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-slate-700 h-full rounded-full" 
                  style={{ width: `${((stats.total - stats.hotLeads - stats.warmLeads) / stats.total) * 100}%` }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Market Reputation & Review Depth */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="mb-3 pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Uy tín Thương hiệu & Mức độ Đánh giá</h3>
            <p className="text-[11px] text-slate-400">Số lượng đánh giá thực tế và điểm số sao trên bản đồ Google Maps</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded">
              <div className="text-[11px] text-slate-400">Điểm đánh giá trung bình</div>
              <div className="flex items-center gap-1.5 font-mono text-xl font-bold text-amber-400 mt-1 tabular-nums">
                <Star className="w-4 h-4 fill-current" />
                <span>{stats.avgRating} / 5.0</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Đánh giá chung của tệp dữ liệu</div>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded">
              <div className="text-[11px] text-slate-400">Lượng Review bình quân</div>
              <div className="font-mono text-xl font-bold text-slate-100 mt-1 tabular-nums">
                {stats.avgReviews}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Lượt review trên mỗi cơ sở</div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Tỷ lệ sở hữu Website:</span>
            <span className="font-mono text-white tabular-nums">{stats.withWebsite} / {stats.total} ({stats.websitePct}%) đã có trang web</span>
          </div>
        </div>
      </div>

      {/* Categories & Cities Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Categories */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Top Ngành nghề được cào nhiều nhất</h3>
          <div className="space-y-1.5">
            {stats.sortedCategories.map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between py-1 border-b border-slate-900">
                <span className="text-slate-300">{cat}</span>
                <span className="font-mono text-slate-400 tabular-nums">{count} địa điểm</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cities */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Phân bố theo Khu vực / Tỉnh thành</h3>
          <div className="space-y-1.5">
            {stats.sortedCities.map(([city, count]) => (
              <div key={city} className="flex items-center justify-between py-1 border-b border-slate-900">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  <span>{city}</span>
                </div>
                <span className="font-mono text-slate-400 tabular-nums">{count} hồ sơ</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
