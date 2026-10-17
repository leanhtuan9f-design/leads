import { APP_NAME } from '../config/brand';
import React from 'react';
import { Database, History, HelpCircle, Activity } from 'lucide-react';
import { ActiveTab } from '../types/scraper';
import { AccountMenu } from './AccountMenu';
import { AuthUser, Quota } from '../auth/types';

// Nút ? mở hướng dẫn đúng với tab đang xem
const GUIDE_BY_TAB: Partial<Record<ActiveTab, string>> = {
  leads: 'data_table', map: 'map_view', jobs: 'jobs_runner', analytics: 'analytics', api: 'api_cli', background: 'admin_background'
};

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenGuide: (guideId: string) => void;
  onOpenProfile: () => void;
  onOpenBilling: () => void;
  totalLeadsCount: number;
  user: AuthUser;
  quota: Quota | null;
  onLogout: () => void;
}

// Lead gồm cả 2 chế độ xem phụ (bản đồ, phân tích) nên vẫn tính là đang ở "Lead"
const LEAD_TABS: ActiveTab[] = ['leads', 'map', 'analytics'];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenGuide,
  onOpenProfile,
  onOpenBilling,
  totalLeadsCount,
  user,
  quota,
  onLogout
}) => {
  const inLeads = LEAD_TABS.includes(activeTab);
  const navCls = (active: boolean) =>
    `flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
      active ? 'text-blue-400 font-semibold border-b-2 border-blue-500' : 'hover:text-white'
    }`;

  return (
    <header className="flex items-center justify-between gap-3 sm:gap-8 px-3 sm:px-6 py-3 bg-slate-950 border-b border-slate-800/80 sticky top-0 z-40">
      <a
        href="#home"
        onClick={(e) => { e.preventDefault(); setActiveTab('leads'); }}
        className="text-base font-bold tracking-tight text-white flex items-center gap-2 whitespace-nowrap shrink-0"
      >
        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white font-mono font-semibold text-xs shadow-sm">
          {APP_NAME.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <span className="hidden sm:inline">{APP_NAME}</span>
      </a>

      <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium text-slate-300 flex-1">
        <button onClick={() => setActiveTab('leads')} className={navCls(inLeads)}>
          <Database className="w-3.5 h-3.5" />
          <span>Lead</span>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">({totalLeadsCount})</span>
        </button>
        <button onClick={() => setActiveTab('jobs')} className={navCls(activeTab === 'jobs')}>
          <History className="w-3.5 h-3.5" />
          <span>Lịch sử</span>
        </button>
        {user.role === 'admin' && (
          <button onClick={() => setActiveTab('background')} className={navCls(activeTab === 'background')}>
            <Activity className="w-3.5 h-3.5" />
            <span>Chạy ngầm</span>
          </button>
        )}
      </nav>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onOpenGuide(GUIDE_BY_TAB[activeTab] || 'data_table')}
          className="p-1.5 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors"
          title="Hướng dẫn sử dụng"
          aria-label="Hướng dẫn sử dụng"
        >
          <HelpCircle className="w-4 h-4 text-blue-400" />
        </button>
        <AccountMenu user={user} quota={quota} onLogout={onLogout} activeTab={activeTab} onNavigate={setActiveTab} onOpenProfile={onOpenProfile} onOpenBilling={onOpenBilling} />
      </div>
    </header>
  );
};
