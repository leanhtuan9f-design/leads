import { APP_NAME } from '../config/brand';
import React from 'react';
import { Download, Play, Compass, Database, MapPin, BarChart3, Terminal, HelpCircle } from 'lucide-react';
import { ActiveTab } from '../types/scraper';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenNewJob: () => void;
  onExportClick: () => void;
  onOpenGuide: (guideId: string) => void;
  totalLeadsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewJob,
  onExportClick,
  onOpenGuide,
  totalLeadsCount
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-950 border-b border-slate-800/80 sticky top-0 z-40">
      {/* Zone 1: Wordmark Brand Title */}
      <div className="flex items-center gap-3 shrink-0">
        <a 
          href="#home" 
          onClick={(e) => { e.preventDefault(); setActiveTab('leads'); }}
          className="text-base font-bold tracking-tight text-white flex items-center gap-2 whitespace-nowrap"
        >
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white font-mono font-semibold text-xs shadow-sm">
            {APP_NAME.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <span>{APP_NAME}</span>
        </a>
      </div>

      {/* Zone 2: Clean Single-line Nav Links (Việt hoá) */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
        <button
          onClick={() => setActiveTab('leads')}
          className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'leads' ? 'text-blue-400 font-semibold border-b-2 border-blue-500' : 'hover:text-white'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Danh sách Lead</span>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">({totalLeadsCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'map' ? 'text-blue-400 font-semibold border-b-2 border-blue-500' : 'hover:text-white'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Bản đồ trực quan</span>
        </button>

        <button
          onClick={() => setActiveTab('jobs')}
          className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'jobs' ? 'text-blue-400 font-semibold border-b-2 border-blue-500' : 'hover:text-white'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Quản lý tác vụ</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'analytics' ? 'text-blue-400 font-semibold border-b-2 border-blue-500' : 'hover:text-white'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Phân tích & Báo cáo</span>
        </button>

        <button
          onClick={() => setActiveTab('api')}
          className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'api' ? 'text-blue-400 font-semibold border-b-2 border-blue-500' : 'hover:text-white'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Tài liệu API & CLI</span>
        </button>
      </nav>

      {/* Zone 3: Primary Actions & Global Help Button */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => onOpenGuide('data_table')}
          className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          title="Xem hướng dẫn sử dụng toàn diện"
        >
          <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Hướng dẫn</span>
        </button>

        <button
          onClick={onExportClick}
          className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>Xuất dữ liệu</span>
        </button>

        <button
          onClick={onOpenNewJob}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-md shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Bắt đầu cào</span>
        </button>
      </div>
    </header>
  );
};
