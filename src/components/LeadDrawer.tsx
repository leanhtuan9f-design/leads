import { BUYER_SEGMENTS, classifyBuyerSegment } from '../../shared/buyer-segments.mjs';
import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  Star, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Copy, 
  Check, 
  Send, 
  Share2, 
  Code, 
  ShieldCheck,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  HelpCircle
} from 'lucide-react';
import { ScrapedBusiness } from '../types/scraper';
import { HelpButton } from './HelpButton';

interface LeadDrawerProps {
  business: ScrapedBusiness | null;
  onClose: () => void;
  onOpenOutreach: (biz: ScrapedBusiness) => void;
  onOpenGuide: (guideId: string) => void;
}

export const LeadDrawer: React.FC<LeadDrawerProps> = ({
  business,
  onClose,
  onOpenOutreach,
  onOpenGuide
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  if (!business) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity">
      <div 
        className="w-full max-w-xl bg-slate-950 border-l border-slate-800 h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur-md flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-blue-400">{business.category}</span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400">{business.priceLevel}</span>
              <span className="text-slate-600">·</span>
              {business.isClaimed ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Đã xác minh
                </span>
              ) : (
                <span className="text-xs text-amber-400 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Chưa xác minh (Cơ hội SEO)
                </span>
              )}
              <HelpButton guideId="data_table" onOpenGuide={onOpenGuide} tooltipText="Xem giải thích chỉ số hồ sơ" />
            </div>
            <h2 className="text-lg font-bold text-white leading-tight">{business.title}</h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-5 space-y-6 flex-1 text-xs">
          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg">
            <div>
              <div className="text-[11px] text-slate-400 mb-0.5">Đánh giá Google</div>
              <div className="flex items-center gap-1 font-mono text-base font-bold text-amber-400 tabular-nums">
                <Star className="w-4 h-4 fill-current" />
                <span>{business.rating.toFixed(1)}</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5 tabular-nums">
                {business.reviewsCount} lượt đánh giá
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 mb-0.5">Điểm hồ sơ</div>
              <div className="font-mono text-base font-bold text-blue-400 tabular-nums">
                {business.leadScore}/100
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">
                {business.leadStatus === 'hot' ? 'Điểm cao' : business.leadStatus === 'warm' ? 'Điểm trung bình' : 'Cơ bản'}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 mb-0.5">Trạng thái mở cửa</div>
              <div className={`font-mono text-xs font-semibold ${business.isOpenNow ? 'text-emerald-400' : 'text-slate-400'}`}>
                {business.isOpenNow ? 'Đang mở cửa' : 'Đang đóng cửa'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5 tabular-nums">
                {business.photosCount} ảnh tải lên
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-slate-300"><strong>{BUYER_SEGMENTS.find(segment => segment.id === classifyBuyerSegment(business))?.name}</strong><p className="mt-2 text-slate-400">Phân tệp dựa trên nhãn ngành chính/phụ. Chưa xác minh hoạt động nhập khẩu hoặc nhu cầu mua. Điểm hồ sơ phản ánh thông tin liên hệ, đánh giá và trạng thái hồ sơ; không phải điểm phù hợp nhập khẩu.</p></div>
          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenOutreach(business)}
              className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Soạn Email chào hàng cho khách</span>
            </button>

            <a
              href={business.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mở Google Maps</span>
            </a>
          </div>

          {/* Contact Details Card */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider text-slate-400">
              Thông tin liên hệ & Kỹ thuật số
            </h3>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
              {/* Email */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="p-1.5 bg-blue-950/60 text-blue-400 rounded">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-[10px] text-slate-400">Email bóc tách từ Website</div>
                    {business.email ? (
                      <a href={`mailto:${business.email}`} className="text-white hover:underline font-mono truncate block">
                        {business.email}
                      </a>
                    ) : (
                      <span className="text-slate-500 italic">Chưa tìm thấy trên trang web</span>
                    )}
                  </div>
                </div>

                {business.email && (
                  <button
                    onClick={() => handleCopy(business.email, 'email')}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors shrink-0"
                    title="Sao chép email"
                  >
                    {copiedKey === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {/* Additional emails if found */}
              {business.additionalEmails && business.additionalEmails.length > 0 && (
                <div className="pl-8 pt-1 text-[11px] text-slate-400 space-y-1 border-t border-slate-800/60">
                  <span className="text-[10px] font-medium text-slate-400">Email phòng ban khác tìm thấy:</span>
                  {business.additionalEmails.map((em, i) => (
                    <div key={i} className="flex items-center justify-between font-mono text-slate-300">
                      <span>{em}</span>
                      <button
                        onClick={() => handleCopy(em, `em_${i}`)}
                        className="text-slate-500 hover:text-slate-300"
                      >
                        {copiedKey === `em_${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Phone */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-emerald-950/60 text-emerald-400 rounded">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Số điện thoại liên hệ</div>
                    {business.phone ? (
                      <a href={`tel:${business.phone}`} className="text-white hover:underline font-mono">
                        {business.phone}
                      </a>
                    ) : (
                      <span className="text-slate-500 italic">Không có số điện thoại</span>
                    )}
                  </div>
                </div>

                {business.phone && (
                  <button
                    onClick={() => handleCopy(business.phone, 'phone')}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors shrink-0"
                    title="Sao chép SĐT"
                  >
                    {copiedKey === 'phone' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {/* Website */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="p-1.5 bg-indigo-950/60 text-indigo-400 rounded">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-[10px] text-slate-400">Website chính thức</div>
                    {business.website ? (
                      <a href={business.website} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline font-mono truncate block">
                        {business.website}
                      </a>
                    ) : (
                      <span className="text-slate-500 italic">Chưa đăng ký website</span>
                    )}
                  </div>
                </div>

                {business.website && (
                  <button
                    onClick={() => handleCopy(business.website, 'website')}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors shrink-0"
                    title="Sao chép website"
                  >
                    {copiedKey === 'website' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Social Profiles */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider text-slate-400">
              Trang Mạng xã hội đã tìm thấy
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {business.socials.instagram ? (
                <a
                  href={business.socials.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded hover:border-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <Instagram className="w-4 h-4 text-pink-400" />
                  <span className="truncate">Instagram</span>
                </a>
              ) : null}

              {business.socials.facebook ? (
                <a
                  href={business.socials.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded hover:border-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <Facebook className="w-4 h-4 text-blue-500" />
                  <span className="truncate">Facebook</span>
                </a>
              ) : null}

              {business.socials.linkedin ? (
                <a
                  href={business.socials.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded hover:border-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <Linkedin className="w-4 h-4 text-sky-400" />
                  <span className="truncate">LinkedIn</span>
                </a>
              ) : null}

              {business.socials.twitter ? (
                <a
                  href={business.socials.twitter}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded hover:border-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <Twitter className="w-4 h-4 text-slate-300" />
                  <span className="truncate">Twitter / X</span>
                </a>
              ) : null}
            </div>
            {Object.keys(business.socials).length === 0 && (
              <p className="text-slate-500 italic text-[11px]">Không phát hiện link mạng xã hội khi quét trang web</p>
            )}
          </div>

          {/* Location & GPS */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider text-slate-400">
              Địa chỉ & Tọa độ GPS
            </h3>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-slate-200 font-medium">{business.address}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {business.city}, {business.state} {business.postalCode} ({business.country})
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-400">
                <div>
                  <span>Vĩ độ (Lat): </span>
                  <span className="text-slate-200 tabular-nums">{business.latitude.toFixed(5)}</span>
                </div>
                <div>
                  <span>Kinh độ (Lon): </span>
                  <span className="text-slate-200 tabular-nums">{business.longitude.toFixed(5)}</span>
                </div>
                <div className="col-span-2 truncate">
                  <span>Google Place ID: </span>
                  <span className="text-slate-300">{business.placeId}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Operating Hours */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider text-slate-400">
              Giờ làm việc & Mở cửa
            </h3>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{business.openHoursSummary}</span>
            </div>
          </div>

          {/* Raw JSON toggle */}
          <div className="pt-2">
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <Code className="w-3.5 h-3.5" />
              <span>{showRawJson ? 'Ẩn đối tượng JSON' : 'Xem dữ liệu JSON'}</span>
            </button>

            {showRawJson && (
              <div className="mt-2 relative">
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-md font-mono text-[10px] text-slate-300 overflow-x-auto max-h-60">
                  {JSON.stringify(business, null, 2)}
                </pre>
                <button
                  onClick={() => handleCopy(JSON.stringify(business, null, 2), 'raw_json')}
                  className="absolute top-2 right-2 px-2 py-1 bg-slate-800 text-slate-300 hover:text-white rounded text-[10px] font-mono flex items-center gap-1"
                >
                  {copiedKey === 'raw_json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>Sao chép JSON</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
