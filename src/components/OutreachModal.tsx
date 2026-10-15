import React, { useState, useMemo } from 'react';
import { X, Send, Copy, Check, Sparkles, Mail, ExternalLink, Download } from 'lucide-react';
import { ScrapedBusiness } from '../types/scraper';
import { exportForCrm } from '../services/exporter';
import { HelpButton } from './HelpButton';

interface OutreachModalProps {
  leads: ScrapedBusiness[];
  onClose: () => void;
  onOpenGuide: (guideId: string) => void;
}

type TemplateType = 'seo_reviews' | 'web_modernization' | 'b2b_growth' | 'partnership';

const TEMPLATES: Record<TemplateType, { title: string; subject: string; body: string }> = {
  seo_reviews: {
    title: 'Local SEO & Tối ưu Google Maps',
    subject: 'Góp ý tối ưu hồ sơ Google Maps cho {business_name} tại {city}',
    body: `Kính gửi Ban Quản Lý {business_name},

Khi tìm kiếm dịch vụ {category} uy tín tại khu vực {city}, tôi có xem qua hồ sơ Google Maps của cơ sở mình ({rating}★ với {reviews_count} lượt đánh giá).

{claim_note}

Bên tôi chuyên hỗ trợ các doanh nghiệp {category} tại {city} tối ưu vị trí TOP 3 Google Maps (Local 3-Pack) và tự động hóa quy trình xin đánh giá từ khách hàng hài lòng, giúp tăng gấp đôi lượng khách gọi điện mỗi tuần.

Tôi có thể gửi qua email này bản phân tích ngắn 2 phút về tiềm năng từ khóa của {business_name} so với đối thủ cùng khu vực được không ạ?

Trân trọng,
Nguyễn Hoàng Long
Chuyên viên Phát triển Khách hàng Doanh nghiệp`
  },
  web_modernization: {
    title: 'Hiện đại hóa Website & Mobile UX',
    subject: 'Góp ý trải nghiệm đặt lịch trên website {business_name}',
    body: `Chào anh/chị phụ trách tại {business_name},

Tôi vừa ghé thăm website của mình ({website}) khi tìm hiểu dịch vụ {category} tại {city}. Dịch vụ bên mình rất chuyên nghiệp và uy tín.

Theo khảo sát mới nhất về hành vi khách hàng tìm {category} trên điện thoại tại {state}, việc bổ sung nút Zalo/Gọi điện tức thì và tăng tốc độ tải trang giúp tỷ lệ khách chuyển đổi thành cuộc gọi đặt lịch tăng trung bình 34%.

Tôi có làm sẵn 3 gợi ý tinh gọn tối ưu riêng cho {website}. Nếu tiện, tôi xin phép gửi trực tiếp qua email này để anh/chị tham khảo nhé?

Chúc cơ sở kinh doanh ngày càng phát đạt!
Trần Văn Minh`
  },
  b2b_growth: {
    title: 'Cung cấp Khách hàng tiềm năng B2B',
    subject: 'Đề xuất hợp tác chuyển giao khách hàng {category} tại {city}',
    body: `Kính gửi Quý cơ sở {business_name},

Tôi liên hệ với anh/chị vì bên tôi hiện đang triển khai chiến dịch thu hút khách hàng có nhu cầu sử dụng dịch vụ {category} tại địa bàn {city}.

Nhận thấy {business_name} có thương hiệu rất tốt ({rating} sao, phục vụ uy tín), chúng tôi muốn tìm kiếm đối tác độc quyền tại khu vực để chuyển tiếp trực tiếp các yêu cầu dịch vụ của khách hàng.

Không biết tuần này ban quản lý có tiện dành 5 phút trao đổi ngắn về cơ chế hợp tác đôi bên cùng có lợi không ạ?

Trân trọng hợp tác!`
  },
  partnership: {
    title: 'Giới thiệu Dịch vụ & Kết nối Địa phương',
    subject: 'Kết nối hợp tác cùng {business_name}',
    body: `Kính gửi Ban Giám Đốc {business_name},

Chúng tôi muốn gửi lời chào trân trọng nhất tới văn phòng của quý đơn vị tại {street}.

Bên tôi chuyên cung cấp các giải pháp hỗ trợ kinh doanh cho các đơn vị trong ngành {category} tại {city}. Rất mong có cơ hội được gửi tài liệu giới thiệu chi tiết hoặc kết nối trực tiếp với người phụ trách hợp tác của {business_name}.

Xin chân thành cảm ơn!`
  }
};

export const OutreachModal: React.FC<OutreachModalProps> = ({
  leads,
  onClose,
  onOpenGuide
}) => {
  const [templateKey, setTemplateKey] = useState<TemplateType>('seo_reviews');
  const [activeLeadIndex, setActiveLeadIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeLead = leads[activeLeadIndex] || leads[0];

  const currentTemplate = TEMPLATES[templateKey];

  // Replace merge tags for active lead
  const renderedContent = useMemo(() => {
    if (!activeLead) return { subject: '', body: '' };

    const claimNote = activeLead.isClaimed
      ? `Hồ sơ doanh nghiệp của mình đã được xác thực tốt, đây là lợi thế rất lớn tại ${activeLead.city}.`
      : `Tôi nhận thấy hồ sơ Google Maps của cơ sở hiện CHƯA ĐƯỢC XÁC MINH CHÍNH CHỦ (Unclaimed). Điều này dễ khiến đối thủ đề xuất chỉnh sửa sai thông tin hoặc bị mất quyền kiểm soát địa điểm.`;

    const rep = (str: string) => {
      return str
        .replace(/\{business_name\}/g, activeLead.title)
        .replace(/\{city\}/g, activeLead.city)
        .replace(/\{state\}/g, activeLead.state)
        .replace(/\{category\}/g, activeLead.category.toLowerCase())
        .replace(/\{rating\}/g, activeLead.rating.toFixed(1))
        .replace(/\{reviews_count\}/g, String(activeLead.reviewsCount))
        .replace(/\{website\}/g, activeLead.website ? activeLead.website.replace(/^https?:\/\//, '') : 'trang web của mình')
        .replace(/\{street\}/g, activeLead.street)
        .replace(/\{claim_note\}/g, claimNote);
    };

    return {
      subject: rep(currentTemplate.subject),
      body: rep(currentTemplate.body)
    };
  }, [activeLead, currentTemplate]);

  const handleCopy = () => {
    const fullText = `Tiêu đề: ${renderedContent.subject}\n\n${renderedContent.body}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenMailto = () => {
    if (!activeLead) return;
    const recipient = activeLead.email || '';
    const subject = encodeURIComponent(renderedContent.subject);
    const body = encodeURIComponent(renderedContent.body);
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
  };

  const handleExportCrm = () => {
    exportForCrm(leads, `chien_dich_outreach_${leads.length}_leads.csv`);
  };

  if (!activeLead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div 
        className="bg-slate-950 border border-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600/20 text-blue-400 rounded">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Trình soạn thảo Email tiếp cận cá nhân hóa</h2>
                <HelpButton guideId="outreach_composer" onOpenGuide={onOpenGuide} tooltipText="Xem cách viết Cold Email đạt tỷ lệ phản hồi cao" />
              </div>
              <p className="text-[11px] text-slate-400">Tự động chèn thông tin địa phương, điểm review và website vào thư chào hàng</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lead Selector Strip if multiple */}
        {leads.length > 1 && (
          <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Khách hàng đang xem:</span>
              <select
                value={activeLeadIndex}
                onChange={(e) => setActiveLeadIndex(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500 font-sans"
              >
                {leads.map((l, idx) => (
                  <option key={l.id} value={idx}>
                    {idx + 1}. {l.title} ({l.city})
                  </option>
                ))}
              </select>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              Khách số {activeLeadIndex + 1} / {leads.length}
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Template Tabs */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Chọn kịch bản tiếp cận khách hàng:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(Object.keys(TEMPLATES) as TemplateType[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setTemplateKey(key)}
                  className={`p-2 rounded text-left transition-colors border ${
                    templateKey === key
                      ? 'bg-blue-600/20 border-blue-500 text-white font-medium'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-semibold truncate">{TEMPLATES[key].title}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Recipient & Contact bar */}
          <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400">Người nhận: </span>
              <span className="text-white font-medium font-mono">
                {activeLead.email || 'Chưa có email (Dùng SĐT: ' + activeLead.phone + ')'}
              </span>
            </div>
            <div className="text-[11px] text-blue-400 font-mono">
              {activeLead.city}, {activeLead.state}
            </div>
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Tiêu đề Email</label>
            <div className="p-2 bg-slate-900 border border-slate-700 rounded text-slate-100 font-mono text-xs select-all">
              {renderedContent.subject}
            </div>
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Nội dung thư chào hàng</label>
            <div className="p-3 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs whitespace-pre-line leading-relaxed font-sans max-h-56 overflow-y-auto select-all">
              {renderedContent.body}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleExportCrm}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất file cho Instantly / Apollo ({leads.length})</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition-colors flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'Đã sao chép nội dung!' : 'Sao chép mẫu'}</span>
            </button>

            {activeLead.email && (
              <button
                onClick={handleOpenMailto}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded text-xs transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Mở trong Ứng dụng Mail</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
