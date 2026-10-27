import React, { Suspense, useState, useEffect, useRef } from 'react';
import { lazyReload } from './utils/lazyReload';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { Header } from './components/Header';
import { DataTable } from './components/DataTable';
import { MapView } from './components/MapView';
import { AnalyticsView } from './components/AnalyticsView';
import { JobsRunnerView } from './components/JobsRunnerView';
import { JobProgressBanner } from './components/JobProgressBanner';
import { LeadDrawer } from './components/LeadDrawer';
import { AuthUser, Quota, apiJson } from './auth/types';

import { ScrapedBusiness, ScraperJob, ScraperOptions, ActiveTab } from './types/scraper';
import { executeScrapingJob, ProgressCallbackData } from './services/scraperEngine';
import { useSyncedList } from './services/useSyncedList';
import { exportToCsv } from './services/exporter';
import { playCompletionSound } from './utils/sound';

import { DirectScrapeBar } from './components/DirectScrapeBar';
import { CompletionSummaryData } from './components/JobProgressBanner';

const ApiDocsModal = lazyReload(() => import('./components/ApiDocsModal').then(m => ({ default: m.ApiDocsModal })));
const OutreachModal = lazyReload(() => import('./components/OutreachModal').then(m => ({ default: m.OutreachModal })));
const ModuleHelpModal = lazyReload(() => import('./components/ModuleHelpModal').then(m => ({ default: m.ModuleHelpModal })));
const TrashModal = lazyReload(() => import('./components/TrashModal').then(m => ({ default: m.TrashModal })));
const AdminUsersView = lazyReload(() => import('./components/AdminUsersView').then(m => ({ default: m.AdminUsersView })));
const AiSettings = lazyReload(() => import('./components/AiSettings').then(m => ({ default: m.AiSettings })));
const BillingSettings = lazyReload(() => import('./components/BillingSettings').then(m => ({ default: m.BillingSettings })));
const AdminBackgroundView = lazyReload(() => import('./components/AdminBackgroundView').then(m => ({ default: m.AdminBackgroundView })));
const MarketConfig = lazyReload(() => import('./components/MarketConfig').then(m => ({ default: m.MarketConfig })));
const ProfileModal = lazyReload(() => import('./components/ProfileModal').then(m => ({ default: m.ProfileModal })));
const BillingModal = lazyReload(() => import('./components/BillingModal').then(m => ({ default: m.BillingModal })));

const STORAGE_KEY_LEADS = 'gmaps_scraper_leads_v3';
const STORAGE_KEY_JOBS = 'gmaps_scraper_jobs_v3';
const STORAGE_KEY_PROXIES = 'gmaps_scraper_proxies_v1';

const parseProxies = (text: string): string[] =>
  text.split('\n').map(l => l.trim()).filter(Boolean);

// Xóa dữ liệu v2 (gồm lead mẫu/lead giả do engine mô phỏng cũ sinh ra) để chỉ còn dữ liệu cào thật
try {
  localStorage.removeItem('gmaps_scraper_leads_v2');
  localStorage.removeItem('gmaps_scraper_jobs_v2');
} catch (e) {}

interface AppProps {
  user: AuthUser;
  quota: Quota | null;
  onLogout: () => void;
  refreshQuota: () => void;
}

export default function App({ user, quota, onLogout, refreshQuota }: AppProps) {
  // Dữ liệu trong trình duyệt tách riêng theo từng tài khoản
  const keyLeads = `${STORAGE_KEY_LEADS}_u${user.id}`;
  const keyJobs = `${STORAGE_KEY_JOBS}_u${user.id}`;
  const keyProxies = `${STORAGE_KEY_PROXIES}_u${user.id}`;
  const keyTab = `gmaps_scraper_tab_u${user.id}`;
  const TABS: ActiveTab[] = ['leads', 'map', 'jobs', 'analytics', 'api', ...(user.role === 'admin' ? (['admin', 'background', 'aiconfig', 'marketconfig', 'billingconfig'] as ActiveTab[]) : [])];
  const [activeTab, setActiveTabRaw] = useState<ActiveTab>(() => {
    try { const t = localStorage.getItem(keyTab) as ActiveTab | null; if (t && TABS.includes(t)) return t; } catch (e) {}
    return 'leads';
  });
  // nhớ tab đang xem để tải lại trang (F5) không bị nhảy về trang Lead
  const setActiveTab = (t: ActiveTab) => { setActiveTabRaw(t); try { localStorage.setItem(keyTab, t); } catch (e) {} };
  const [businesses, setBusinesses] = useState<ScrapedBusiness[]>(() => {
    try {
      const saved = localStorage.getItem(keyLeads) || localStorage.getItem(STORAGE_KEY_LEADS); // key cũ (trước khi có đăng nhập)
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // fallback
    }
    return [];
  });

  const [jobs, setJobs] = useState<ScraperJob[]>(() => {
    try {
      const saved = localStorage.getItem(keyJobs) || localStorage.getItem(STORAGE_KEY_JOBS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // fallback
    }
    return [];
  });

  // Proxy do người dùng nhập (mỗi dòng một proxy), lưu trong trình duyệt này
  const [proxiesText, setProxiesText] = useState<string>(() => {
    try { return localStorage.getItem(keyProxies) || localStorage.getItem(STORAGE_KEY_PROXIES) || ''; } catch (e) { return ''; }
  });
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [dataNote, setDataNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Modal and drawer states
  const [selectedBusiness, setSelectedBusiness] = useState<ScrapedBusiness | null>(null);
  const [outreachLeads, setOutreachLeads] = useState<ScrapedBusiness[] | null>(null);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(() => new URLSearchParams(window.location.search).get('billing') === '1');
  const [profileVersion, setProfileVersion] = useState(0); // tăng khi lưu hồ sơ → thanh tìm kiếm tải lại gợi ý

  // Active Job Execution state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<ProgressCallbackData | null>(null);
  const [completionSummary, setCompletionSummary] = useState<CompletionSummaryData | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  // Đồng bộ: localStorage làm bộ đệm nhanh, server (SQLite theo tài khoản) là nơi lưu chính.
  // Lead/job đồng bộ từng dòng (useSyncedList); proxy là chuỗi nhỏ nên ghi nguyên khối.
  const jobSort = React.useCallback((a: ScraperJob, b: ScraperJob) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0), []);
  const leadsSync = useSyncedList<ScrapedBusiness>('leads', businesses, setBusinesses, undefined, { canRemove: user.role === 'admin' });
  const jobsSync = useSyncedList<ScraperJob>('jobs', jobs, setJobs, jobSort);
  const [proxiesReady, setProxiesReady] = useState(false);
  const [proxySyncError, setProxySyncError] = useState<string | null>(null);
  const proxiesRef = useRef(proxiesText);
  proxiesRef.current = proxiesText;
  const syncError = leadsSync.error || jobsSync.error || proxySyncError;

  useEffect(() => {
    apiJson<{ value: string | null }>('/state/proxies')
      .then(p => {
        if (p.value) setProxiesText(p.value);
        else if (proxiesRef.current) apiJson('/state/proxies', 'PUT', { value: proxiesRef.current }).catch(() => {});
        setProxiesReady(true);
      })
      .catch(() => setProxySyncError('Không tải được dữ liệu từ máy chủ — đang dùng bản lưu trong trình duyệt.'));
  }, []);

  // Lần tìm còn ghi 'Đang chạy' nhưng trang vừa tải lại (không còn tiến trình trong trình duyệt) → 'Tạm dừng', giữ nguyên lead đã lấy, có nút Tiếp tục
  const staleFixedRef = useRef(false);
  useEffect(() => {
    if (!jobsSync.ready || staleFixedRef.current) return;
    staleFixedRef.current = true;
    setJobs(prev => prev.some(j => j.status === 'running')
      ? prev.map(j => (j.status === 'running' ? { ...j, status: 'paused' as const, scrapedCount: j.results.length } : j))
      : prev);
  }, [jobsSync.ready]);

  useEffect(() => {
    if (!(leadsSync.ready && jobsSync.ready && proxiesReady)) return;
    // Đã chuyển dữ liệu key cũ (không hậu tố user) vào tài khoản này → xóa để tài khoản khác không nhận nhầm
    try {
      localStorage.removeItem(STORAGE_KEY_LEADS);
      localStorage.removeItem(STORAGE_KEY_JOBS);
      localStorage.removeItem(STORAGE_KEY_PROXIES);
    } catch (e) {}
  }, [leadsSync.ready, jobsSync.ready, proxiesReady]);

  useEffect(() => {
    try { localStorage.setItem(keyLeads, JSON.stringify(businesses)); } catch (e) {}
  }, [businesses]);
  useEffect(() => {
    try { localStorage.setItem(keyJobs, JSON.stringify(jobs)); } catch (e) {}
  }, [jobs]);
  useEffect(() => {
    try { localStorage.setItem(keyProxies, proxiesText); } catch (e) {}
    if (!proxiesReady) return;
    const t = setTimeout(() => {
      apiJson('/state/proxies', 'PUT', { value: proxiesText })
        .then(() => setProxySyncError(null))
        .catch(() => setProxySyncError('Chưa lưu được lên máy chủ — sẽ thử lại ở lần thay đổi sau.'));
    }, 1000);
    return () => clearTimeout(t);
  }, [proxiesText, proxiesReady]);

  // Handle Starting a Scrape Job
  const handleStartScrape = async (options: ScraperOptions, resume?: ScraperJob) => {
    const jobId = resume ? resume.id : `job_${Date.now()}`;
    const targetName = options.category && options.location
      ? `${options.category} tại ${options.location}`
      : options.query;

    const effectiveOptions: ScraperOptions = {
      ...options,
      existingBusinesses: options.existingBusinesses || businesses,
      proxies: options.proxies ?? parseProxies(proxiesText)
    };

    const newJob: ScraperJob = {
      id: jobId,
      name: `Cào: ${targetName}`,
      query: targetName,
      status: 'running',
      totalFound: options.maxResults,
      scrapedCount: 0,
      targetCount: options.maxResults,
      speedPerMin: 120,
      startedAt: new Date().toLocaleTimeString(),
      options: effectiveOptions,
      results: []
    };

    if (resume) setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, status: 'running', finishedAt: undefined } : j)));
    else setJobs(prev => [newJob, ...prev]);
    setActiveJobId(jobId);
    setCompletionSummary(null); // Clear previous summary
    setScrapeError(null);
    setDataNote(null);
    setNotice(null);
    isCancelledRef.current = false;

    const progressRef = { current: null as ProgressCallbackData | null };

    try {
      const scraped = await executeScrapingJob(
        effectiveOptions,
        (progress) => {
          progressRef.current = progress;
          if (progress.notice) setNotice(progress.notice);
          if (progress.cacheInfo) {
            const ci = progress.cacheInfo;
            const age = ci.oldestAt ? Math.max(0, Math.floor((Date.now() - ci.oldestAt) / 86400000)) : null;
            setDataNote(
              (ci.source === 'cache' ? 'Dữ liệu lấy từ kho đã lưu' : 'Dữ liệu gồm kho đã lưu và cào mới') +
              (age !== null ? ` (bản cũ nhất cập nhật ${age === 0 ? 'hôm nay' : age + ' ngày trước'})` : '') +
              (ci.refreshing ? ' · đang cập nhật bản mới ở nền, lần tìm sau sẽ có dữ liệu mới hơn.' : '.')
            );
          }
          setJobProgress(progress);
          // Stream new results to live table
          if (progress.newPlace) {
            const np = progress.newPlace;
            setBusinesses(prev => [np, ...prev]);
            // ghi ngay vào bản ghi lần tìm để tải lại trang vẫn còn đủ lead đã lấy
            setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, results: [...j.results, np], scrapedCount: j.results.length + 1 } : j)));
          }
        },
        () => isCancelledRef.current
      );

      // Finish job
      const finishTime = new Date().toLocaleTimeString();
      setJobs(prev => prev.map(j => {
        if (j.id === jobId) {
          return {
            ...j,
            status: isCancelledRef.current ? 'paused' : 'completed',
            scrapedCount: Math.max(scraped.length, j.results.length),
            finishedAt: finishTime,
            results: j.results.length >= scraped.length ? j.results : scraped
          };
        }
        return j;
      }));

      // If not cancelled, show completion summary and play chime
      if (!isCancelledRef.current && scraped.length > 0) {
        const withEmail = scraped.filter(b => b.email).length;
        const withPhone = scraped.filter(b => b.phone).length;
        const unclaimed = scraped.filter(b => !b.isClaimed).length;

        setCompletionSummary({
          query: targetName,
          totalScraped: scraped.length,
          withEmail,
          withPhone,
          unclaimed,
          completedAt: finishTime,
          results: scraped,
          skippedDuplicates: progressRef.current?.skippedDuplicates || 0,
          marketCoveragePct: progressRef.current?.marketCoveragePercent || 100,
          marketEstimatedTotal: progressRef.current?.marketEstimatedTotal || 115,
          isMarketExhausted: progressRef.current?.isMarketExhausted || false
        });

        // Play pleasant completion sound chime
        playCompletionSound();
      } else if (!isCancelledRef.current && scraped.length === 0) {
        setNotice('Không tìm thấy lead mới (có thể toàn bộ đã có trong danh sách, hoặc bộ lọc quá chặt).');
      }
    } catch (err) {
      setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, status: 'failed' } : j)));
      setScrapeError(err instanceof Error ? err.message : 'Cào thất bại');
    } finally {
      setActiveJobId(null);
      setJobProgress(null);
      refreshQuota(); // cập nhật hạn mức đã dùng
    }
  };

  // Banner hoàn tất tự ẩn sau 20 giây
  useEffect(() => {
    if (!completionSummary) return;
    const t = setTimeout(() => setCompletionSummary(null), 20000);
    return () => clearTimeout(t);
  }, [completionSummary]);

  const handleResumeJob = (job: ScraperJob) => {
    if (activeJobId) return;
    // existingBusinesses để trống → dùng bảng lead hiện tại, nên chỉ lấy thêm phần còn thiếu (phần đã có lấy từ kho rất nhanh)
    handleStartScrape({ ...job.options, existingBusinesses: undefined }, job);
  };

  const handleCancelScrape = () => {
    isCancelledRef.current = true;
    if (activeJobId) {
      setJobs(prev => prev.map(j => (j.id === activeJobId ? { ...j, status: 'paused' } : j)));
    }
    setActiveJobId(null);
    setJobProgress(null);
  };

  const handleDeleteJob = (jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  };

  // Xem kết quả một job = chỉ lọc hiển thị, không thay/xóa bảng lead đã lưu
  const [viewJob, setViewJob] = useState<{ results: ScrapedBusiness[] } | null>(null);
  const [trashKind, setTrashKind] = useState<'leads' | 'jobs' | null>(null);
  const shown = viewJob ? viewJob.results : businesses;
  const handleSelectJobResults = (jobResults: ScrapedBusiness[]) => {
    setViewJob({ results: jobResults });
    setActiveTab('leads');
  };
  const handleRestoreJobs = (restored: ScraperJob[]) => {
    setJobs(prev => {
      const have = new Set(prev.map(j => j.id));
      return [...restored.filter(j => !have.has(j.id)), ...prev].sort(jobSort);
    });
  };
  const handleRestoreLeads = (restored: ScrapedBusiness[]) => {
    setBusinesses(prev => {
      const have = new Set(prev.map(b => b.id));
      return [...restored.filter(b => !have.has(b.id)), ...prev];
    });
  };

  const inLeads = activeTab === 'leads' || activeTab === 'map' || activeTab === 'analytics';
  const VIEWS: { id: ActiveTab; label: string }[] = [
    { id: 'leads', label: 'Bảng' },
    { id: 'map', label: 'Bản đồ' },
    { id: 'analytics', label: 'Phân tích' }
  ];
  // Chỉ một thông báo chính tại một thời điểm: lỗi > đang chạy/hoàn tất > cảnh báo đồng bộ
  const infoNote = notice ? `⚠️ ${notice}` : dataNote ? `📦 ${dataNote}` : null;
  const showProgress = Boolean(activeJobId) || Boolean(completionSummary);

  return <ChunkErrorBoundary><Suspense fallback={<div className="min-h-[16rem] flex items-center justify-center text-sm text-slate-500">Đang tải…</div>}>
    <>
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenGuide={(guideId) => setActiveGuideId(guideId)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenBilling={() => setBillingOpen(true)}
        totalLeadsCount={businesses.length}
        user={user}
        quota={quota}
        onLogout={onLogout}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto p-3 sm:p-6 flex flex-col">
        {inLeads && (
          <DirectScrapeBar
            existingBusinesses={businesses}
            onStartScrape={handleStartScrape}
            isRunning={Boolean(activeJobId)}
            proxiesText={proxiesText}
            onChangeProxies={setProxiesText}
            proxyCount={parseProxies(proxiesText).length}
            quota={quota}
            profileVersion={profileVersion}
            onOpenProfile={() => setProfileOpen(true)}
          />
        )}

        {/* Vùng thông báo duy nhất */}
        {scrapeError ? (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/40 rounded-lg text-xs text-red-200 flex items-start justify-between gap-3">
            <span><strong>Tìm thất bại:</strong> {scrapeError}</span>
            <button type="button" onClick={() => setScrapeError(null)} className="text-red-300 hover:text-white shrink-0">Đóng</button>
          </div>
        ) : showProgress ? (
          <JobProgressBanner
            progress={jobProgress}
            isRunning={Boolean(activeJobId)}
            completionSummary={completionSummary}
            info={infoNote}
            onCancel={handleCancelScrape}
            onCloseCompletion={() => setCompletionSummary(null)}
            onExportCsv={(results) => exportToCsv(results, `leads_${Date.now()}.csv`)}
            onViewResults={(results) => { setCompletionSummary(null); handleSelectJobResults(results); }}
          />
        ) : syncError ? (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg text-xs text-amber-200">⚠️ {syncError}</div>
        ) : infoNote ? (
          <div className="mb-4 p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-300 flex items-start justify-between gap-3">
            <span>{infoNote}</span>
            <button type="button" onClick={() => { setNotice(null); setDataNote(null); }} className="text-slate-400 hover:text-white shrink-0">Đóng</button>
          </div>
        ) : null}

        {inLeads && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-md border border-slate-800 text-xs">
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  onClick={() => setActiveTab(v.id)}
                  className={`px-3 py-1 rounded transition-colors ${activeTab === v.id ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {!viewJob && user.role === 'admin' && (
              <button type="button" onClick={() => setTrashKind('leads')} className="text-[11px] text-slate-400 hover:text-white underline">Khôi phục lead đã xóa</button>
            )}
          </div>
        )}

        {inLeads && viewJob && (
          <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/40 rounded-lg text-xs text-blue-200 flex items-center justify-between gap-3">
            <span>Đang xem kết quả của một lần tìm ({viewJob.results.length} lead). Danh sách lead đã lưu không bị thay đổi.</span>
            <button type="button" onClick={() => setViewJob(null)} className="text-blue-300 hover:text-white shrink-0">Xem tất cả lead</button>
          </div>
        )}

        {activeTab === 'leads' && (
          <DataTable
            businesses={shown}
            onSelectBusiness={(biz) => setSelectedBusiness(biz)}
            onOpenOutreachModal={(selected) => setOutreachLeads(selected)}
          />
        )}

        {activeTab === 'map' && (
          <MapView
            businesses={shown}
            onSelectBusiness={(biz) => setSelectedBusiness(biz)}
            onOpenGuide={(guideId) => setActiveGuideId(guideId)}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            businesses={shown}
            onOpenOutreachModal={(leads) => setOutreachLeads(leads)}
            onOpenGuide={(guideId) => setActiveGuideId(guideId)}
          />
        )}

        {activeTab === 'jobs' && (
          <JobsRunnerView
            jobs={jobs}
            activeJobId={activeJobId}
            onOpenNewJob={() => setActiveTab('leads')}
            onResumeJob={handleResumeJob}
            onSelectJobResults={handleSelectJobResults}
            onDeleteJob={handleDeleteJob}
            onOpenTrash={() => setTrashKind('jobs')}
          />
        )}

        {activeTab === 'admin' && user.role === 'admin' && <AdminUsersView currentUserId={user.id} />}

        {activeTab === 'background' && user.role === 'admin' && <AdminBackgroundView onOpenGuide={(guideId) => setActiveGuideId(guideId)} />}
        {activeTab === 'aiconfig' && user.role === 'admin' && <div className="max-w-xl text-xs"><h2 className="text-sm font-bold text-white mb-1">Cấu hình AI</h2><AiSettings onSaved={() => {}} /></div>}
        {activeTab === 'billingconfig' && user.role === 'admin' && <div className="max-w-3xl text-xs"><BillingSettings /></div>}
        {activeTab === 'marketconfig' && user.role === 'admin' && <MarketConfig />}

        {activeTab === 'api' && <ApiDocsModal onOpenGuide={(guideId) => setActiveGuideId(guideId)} />}
      </main>

      <LeadDrawer
        business={selectedBusiness}
        onClose={() => setSelectedBusiness(null)}
        onOpenOutreach={(biz) => {
          setSelectedBusiness(null);
          setOutreachLeads([biz]);
        }}
        onOpenGuide={(guideId) => setActiveGuideId(guideId)}
      />

      {outreachLeads && (
        <OutreachModal
          leads={outreachLeads}
          onClose={() => setOutreachLeads(null)}
          onOpenGuide={(guideId) => setActiveGuideId(guideId)}
        />
      )}

      {trashKind && <TrashModal kind={trashKind} onRestore={trashKind === 'leads' ? handleRestoreLeads : handleRestoreJobs} onClose={() => setTrashKind(null)} />}

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} onSaved={() => setProfileVersion(v => v + 1)} />}
      {billingOpen && <BillingModal userEmail={user.email} trialId={user.role === 'trial' ? String(user.id) : undefined} onClose={() => setBillingOpen(false)} onActivated={() => window.location.reload()} />}

      {activeGuideId && (
        <ModuleHelpModal
          guideId={activeGuideId}
          onClose={() => setActiveGuideId(null)}
          onSelectGuide={(id) => setActiveGuideId(id)}
        />
      )}
    </div>
    </>
  </Suspense></ChunkErrorBoundary>;
}
