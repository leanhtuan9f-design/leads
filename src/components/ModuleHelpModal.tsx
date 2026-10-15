import React, { useState } from 'react';
import { 
  X, 
  HelpCircle, 
  BookOpen, 
  CheckCircle2, 
  Lightbulb, 
  Layers, 
  Cpu, 
  ChevronRight,
  Database,
  MapPin,
  Compass,
  BarChart3,
  Terminal,
  Send,
  Download,
  Zap,
  Shield
} from 'lucide-react';
import { MODULE_GUIDES, ModuleGuide } from '../data/moduleGuides';

interface ModuleHelpModalProps {
  guideId: string;
  onClose: () => void;
  onSelectGuide: (id: string) => void;
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
  scraper_config: <Zap className="w-3.5 h-3.5" />,
  deduplication_and_market_exhaustion: <Layers className="w-3.5 h-3.5 text-amber-400" />,
  multi_user_google_policy: <Shield className="w-3.5 h-3.5 text-emerald-400" />,
  data_table: <Database className="w-3.5 h-3.5" />,
  map_view: <MapPin className="w-3.5 h-3.5" />,
  jobs_runner: <Compass className="w-3.5 h-3.5" />,
  analytics: <BarChart3 className="w-3.5 h-3.5" />,
  outreach_composer: <Send className="w-3.5 h-3.5" />,
  api_cli: <Terminal className="w-3.5 h-3.5" />,
  export_dialog: <Download className="w-3.5 h-3.5" />
};

export const ModuleHelpModal: React.FC<ModuleHelpModalProps> = ({
  guideId,
  onClose,
  onSelectGuide
}) => {
  const currentGuide: ModuleGuide = MODULE_GUIDES[guideId] || MODULE_GUIDES['scraper_config'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div 
        className="bg-slate-950 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Sổ tay hướng dẫn & Giải thích Logic vận hành</h2>
                <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded font-mono">
                  {currentGuide.tag}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Chi tiết nguyên lý hoạt động, thuật toán bóc tách và các bước thao tác thực chiến
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body with Sidebar Navigation */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Module Selector Sidebar */}
          <div className="w-full md:w-64 bg-slate-900/60 border-r border-slate-800 p-3 overflow-y-auto space-y-1 shrink-0">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 mb-1">
              Danh mục Module
            </div>
            {Object.values(MODULE_GUIDES).map((guide) => {
              const isSelected = guide.id === currentGuide.id;
              return (
                <button
                  key={guide.id}
                  onClick={() => onSelectGuide(guide.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white font-medium shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <span className={`${isSelected ? 'text-white' : 'text-slate-400'}`}>
                    {MODULE_ICONS[guide.id] || <Layers className="w-3.5 h-3.5" />}
                  </span>
                  <span className="truncate flex-1">{guide.title.split('(')[0].trim()}</span>
                  <ChevronRight className={`w-3 h-3 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                </button>
              );
            })}
          </div>

          {/* Guide Content Display */}
          <div className="flex-1 p-5 overflow-y-auto space-y-5 text-xs text-slate-200">
            {/* Header info */}
            <div>
              <div className="text-[11px] font-mono text-blue-400 mb-0.5">Module: {currentGuide.id}</div>
              <h3 className="text-base font-bold text-white">{currentGuide.title}</h3>
              <p className="text-slate-400 text-xs mt-1">{currentGuide.subtitle}</p>
            </div>

            {/* Section 1: Logic hoạt động & Thuật toán */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-white font-semibold text-xs pb-1 border-b border-slate-800">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span>1. Logic hoạt động & Cơ chế kỹ thuật (Technical Logic)</span>
              </div>
              <ul className="space-y-2 text-slate-300 leading-relaxed">
                {currentGuide.logicExplanation.map((line, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-blue-400 font-mono mt-0.5">›</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Section 2: Hướng dẫn sử dụng từng bước */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-white font-semibold text-xs pb-1 border-b border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>2. Hướng dẫn thao tác từng bước (Step-by-step Usage)</span>
              </div>
              <div className="space-y-2">
                {currentGuide.steps.map((step, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80 flex items-start gap-2.5">
                    <span className="font-mono text-xs font-bold text-emerald-400 shrink-0">
                      0{idx + 1}
                    </span>
                    <span className="text-slate-200 leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Mẹo thực chiến cho B2B Lead Gen & Sales */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-white font-semibold text-xs pb-1 border-b border-slate-800">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>3. Mẹo thực chiến & Cơ hội kinh doanh (Pro Tips)</span>
              </div>
              <ul className="space-y-2 text-slate-300 leading-relaxed">
                {currentGuide.proTips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold mt-0.5">★</span>
                    <span className="text-amber-100/90">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Section 4: Giải thích các trường dữ liệu nếu có */}
            {currentGuide.fieldExplanations && currentGuide.fieldExplanations.length > 0 && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-white font-semibold text-xs pb-1 border-b border-slate-800">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span>4. Giải thích các trường dữ liệu quan trọng</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentGuide.fieldExplanations.map((f, idx) => (
                    <div key={idx} className="p-2 bg-slate-950 rounded border border-slate-800">
                      <div className="font-semibold text-white font-mono text-[11px] text-blue-300">{f.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="text-slate-400 text-[11px]">
            Hệ thống cào dữ liệu Google Maps mã nguồn mở phát triển theo cấu trúc <strong className="text-white">gosom/google-maps-scraper</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-md transition-colors"
          >
            Đóng hướng dẫn
          </button>
        </div>
      </div>
    </div>
  );
};
