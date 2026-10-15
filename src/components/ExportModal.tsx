import React, { useState } from 'react';
import { X, FileSpreadsheet, Code, Send, Copy, Check, Download } from 'lucide-react';
import { ScrapedBusiness } from '../types/scraper';
import { exportToCsv, exportToJson, exportForCrm, copyToClipboardTsv } from '../services/exporter';
import { HelpButton } from './HelpButton';

interface ExportModalProps {
  businesses: ScrapedBusiness[];
  onClose: () => void;
  onOpenGuide: (guideId: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ businesses, onClose, onOpenGuide }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyTsv = async () => {
    const ok = await copyToClipboardTsv(businesses);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div 
        className="bg-slate-950 border border-slate-800 rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Xuất dữ liệu địa điểm & Khách hàng</h2>
              <HelpButton guideId="export_dialog" onOpenGuide={onOpenGuide} tooltipText="Xem hướng dẫn các định dạng xuất file" />
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Sẵn sàng xuất <span className="font-mono text-white font-semibold tabular-nums">{businesses.length}</span> hồ sơ doanh nghiệp đã thu thập
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {/* CSV full export */}
          <button
            onClick={() => {
              exportToCsv(businesses, `google_maps_leads_${Date.now()}.csv`);
              onClose();
            }}
            className="p-3 bg-slate-900 border border-slate-800 hover:border-blue-500 rounded-lg text-left transition-all flex items-start gap-3 group"
          >
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-white group-hover:text-blue-400 transition-colors flex items-center justify-between">
                <span>File CSV Tiêu chuẩn (Đầy đủ 33+ cột dữ liệu)</span>
                <span className="text-[10px] font-mono text-slate-400">.csv</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bao gồm tên, số điện thoại, email, địa chỉ cụ thể, tọa độ GPS và xếp hạng sao. Tương thích trực tiếp với Excel & Google Sheets.
              </p>
            </div>
          </button>

          {/* CRM Outreach CSV */}
          <button
            onClick={() => {
              exportForCrm(businesses, `crm_outreach_leads_${Date.now()}.csv`);
              onClose();
            }}
            className="p-3 bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-lg text-left transition-all flex items-start gap-3 group"
          >
            <div className="p-2 bg-emerald-600/20 text-emerald-400 rounded group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Send className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors flex items-center justify-between">
                <span>File CSV chuẩn hóa cho CRM & Cold Email</span>
                <span className="text-[10px] font-mono text-slate-400">Instantly / Apollo</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Chuẩn hóa sẵn tên cột quốc tế (Company, Email, Phone, Website, City, Rating) để nhập trực tiếp vào hệ thống gửi thư tự động.
              </p>
            </div>
          </button>

          {/* JSON schema */}
          <button
            onClick={() => {
              exportToJson(businesses, `leads_${Date.now()}.json`);
              onClose();
            }}
            className="p-3 bg-slate-900 border border-slate-800 hover:border-purple-500 rounded-lg text-left transition-all flex items-start gap-3 group"
          >
            <div className="p-2 bg-purple-600/20 text-purple-400 rounded group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Code className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-white group-hover:text-purple-400 transition-colors flex items-center justify-between">
                <span>Dữ liệu JSON thô (đầy đủ trường)</span>
                <span className="text-[10px] font-mono text-slate-400">.json</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Cấu trúc mảng đối tượng phân cấp, có mảng danh mục con, mạng xã hội, thích hợp cho việc nạp vào cơ sở dữ liệu.
              </p>
            </div>
          </button>

          {/* Copy TSV to clipboard */}
          <button
            onClick={handleCopyTsv}
            className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-lg text-left transition-all flex items-start gap-3 group"
          >
            <div className="p-2 bg-slate-800 text-slate-300 rounded group-hover:bg-slate-700 group-hover:text-white transition-colors">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-white flex items-center justify-between">
                <span>{copied ? 'Đã sao chép vào bộ nhớ tạm!' : 'Sao chép TSV vào Clipboard'}</span>
                <span className="text-[10px] font-mono text-slate-400">Dán nhanh vào Sheets</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Mở một trang Google Sheet hoặc Excel trống, nhấn Ctrl+V (hoặc Cmd+V) để dán dữ liệu thành các cột tức thì mà không cần tải file.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
