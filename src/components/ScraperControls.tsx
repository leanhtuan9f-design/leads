import React, { useState } from 'react';
import { Search, Globe, Mail, Phone, Sliders, Shield, Zap, X, Sparkles, HelpCircle } from 'lucide-react';
import { ScraperOptions } from '../types/scraper';
import { PRESET_QUERIES } from '../data/seedData';
import { HelpButton } from './HelpButton';

interface ScraperControlsProps {
  onStartScrape: (options: ScraperOptions) => void;
  isRunning: boolean;
  onClose?: () => void;
  onOpenGuide: (guideId: string) => void;
  isModal?: boolean;
}

export const ScraperControls: React.FC<ScraperControlsProps> = ({
  onStartScrape,
  isRunning,
  onClose,
  onOpenGuide,
  isModal = false
}) => {
  const [category, setCategory] = useState('Phòng khám nha khoa');
  const [location, setLocation] = useState('Hà Nội');
  const [maxResults, setMaxResults] = useState(25);
  const [extractEmails, setExtractEmails] = useState(true);
  const [skipWithoutPhone, setSkipWithoutPhone] = useState(false);
  const [skipWithoutWebsite, setSkipWithoutWebsite] = useState(false);
  const [language, setLanguage] = useState('vi');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category.trim() || !location.trim() || isRunning) return;

    const fullQuery = `${category.trim()} tại ${location.trim()}`;

    onStartScrape({
      query: fullQuery,
      category: category.trim(),
      location: location.trim(),
      maxResults,
      extractEmails,
      skipWithoutPhone,
      skipWithoutWebsite,
      language
    });

    if (onClose) onClose();
  };

  const handleSelectPreset = (presetCategory: string, presetLocation: string) => {
    setCategory(presetCategory);
    setLocation(presetLocation);
  };

  const content = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header if modal */}
      {isModal && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">Cấu hình Google Maps Scraper</h2>
                <HelpButton guideId="scraper_config" onOpenGuide={onOpenGuide} tooltipText="Xem logic cào dữ liệu & hướng dẫn" />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Thu thập địa điểm Google Maps & bóc tách email từ website doanh nghiệp</p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Two Explicit Inputs: Industry & Location/Coordinates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Ô nhập 1: Ngành nghề */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            1. [Ngành nghề / Dịch vụ]
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ví dụ: Nha khoa, Quán cafe, Xây dựng..."
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            required
          />
        </div>

        {/* Ô nhập 2: Địa điểm hoặc Tọa độ GPS */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            2. [Địa điểm / Tọa độ GPS]
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ví dụ: Hà Nội hoặc 21.0285, 105.8542"
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
            required
          />
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-slate-400">Từ khóa mẫu phổ biến (Bấm để chọn):</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_QUERIES.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectPreset(p.category, p.label.includes('tại') ? p.label.split('tại')[1]?.trim() : (p.label.includes('in') ? p.label.split('in')[1]?.trim() : 'Hà Nội'))}
              className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap ${
                category === p.category
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target Depth & Proxy */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-300">
              Số lượng địa điểm cần cào
            </label>
          </div>
          <select
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
          >
            <option value={10}>10 Địa điểm (Xem nhanh)</option>
            <option value={25}>25 Địa điểm (Tiêu chuẩn)</option>
            <option value={50}>50 Địa điểm (Quét sâu)</option>
            <option value={100}>100 Địa điểm (Toàn diện)</option>
            <option value={200}>200 Địa điểm (Quy mô lớn)</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-300">
              Ngôn ngữ kết quả Google Maps
            </label>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      {/* Enrichment Options */}
      <div className="space-y-2 pt-1 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">
            Tùy chọn trích xuất & làm giàu dữ liệu (Enrichment)
          </span>
          <HelpButton guideId="scraper_config" onOpenGuide={onOpenGuide} tooltipText="Tìm hiểu cách bóc tách Email & Mạng xã hội" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex items-center gap-2 p-2 bg-slate-900/60 rounded border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={extractEmails}
              onChange={(e) => setExtractEmails(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            <div className="flex items-center gap-1.5 text-xs text-slate-200">
              <Mail className="w-3.5 h-3.5 text-blue-400" />
              <span>Quét website doanh nghiệp để bóc tách Email</span>
            </div>
          </label>

          <label className="flex items-center gap-2 p-2 bg-slate-900/60 rounded border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={skipWithoutPhone}
              onChange={(e) => setSkipWithoutPhone(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            <div className="flex items-center gap-1.5 text-xs text-slate-200">
              <Phone className="w-3.5 h-3.5 text-indigo-400" />
              <span>Bắt buộc có Số điện thoại</span>
            </div>
          </label>

          <label className="flex items-center gap-2 p-2 bg-slate-900/60 rounded border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={skipWithoutWebsite}
              onChange={(e) => setSkipWithoutWebsite(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            <div className="flex items-center gap-1.5 text-xs text-slate-200">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Bắt buộc có Website chính thức</span>
            </div>
          </label>
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isRunning || !category.trim() || !location.trim()}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium text-xs rounded-md shadow transition-colors flex items-center justify-center gap-2"
        >
          {isRunning ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span>Đang cào dữ liệu Google Maps chạy nền...</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              <span>Khởi chạy cào dữ liệu ({maxResults} địa điểm)</span>
            </>
          )}
        </button>
      </div>
    </form>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 max-w-lg w-full shadow-2xl">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
      {content}
    </div>
  );
};
