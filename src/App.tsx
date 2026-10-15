import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { DataTable } from './components/DataTable';
import { MapView } from './components/MapView';
import { AnalyticsView } from './components/AnalyticsView';
import { JobsRunnerView } from './components/JobsRunnerView';
import { ApiDocsModal } from './components/ApiDocsModal';
import { ScraperControls } from './components/ScraperControls';
import { JobProgressBanner } from './components/JobProgressBanner';
import { LeadDrawer } from './components/LeadDrawer';
import { OutreachModal } from './components/OutreachModal';
import { ExportModal } from './components/ExportModal';
import { ModuleHelpModal } from './components/ModuleHelpModal';

import { ScrapedBusiness, ScraperJob, ScraperOptions, ActiveTab } from './types/scraper';
import { executeScrapingJob, ProgressCallbackData } from './services/scraperEngine';
import { exportToCsv } from './services/exporter';
import { playCompletionSound } from './utils/sound';

import { DirectScrapeBar } from './components/DirectScrapeBar';
import { CompletionSummaryData } from './components/JobProgressBanner';

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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('leads');
  const [businesses, setBusinesses] = useState<ScrapedBusiness[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LEADS);
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
      const saved = localStorage.getItem(STORAGE_KEY_JOBS);
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
    try { return localStorage.getItem(STORAGE_KEY_PROXIES) || ''; } catch (e) { return ''; }
  });
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [dataNote, setDataNote] = useState<string | null>(null);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_PROXIES, proxiesText); } catch (e) {}
  }, [proxiesText]);

  // Modal and drawer states
  const [isScraperModalOpen, setIsScraperModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<ScrapedBusiness | null>(null);
  const [outreachLeads, setOutreachLeads] = useState<ScrapedBusiness[] | null>(null);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);

  // Active Job Execution state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<ProgressCallbackData | null>(null);
  const [completionSummary, setCompletionSummary] = useState<CompletionSummaryData | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LEADS, JSON.stringify(businesses));
    } catch (e) {}
  }, [businesses]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_JOBS, JSON.stringify(jobs));
    } catch (e) {}
  }, [jobs]);

  // Handle Starting a Scrape Job
  const handleStartScrape = async (options: ScraperOptions) => {
    const jobId = `job_${Date.now()}`;
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

    setJobs(prev => [newJob, ...prev]);
    setActiveJobId(jobId);
    setCompletionSummary(null); // Clear previous summary
    setScrapeError(null);
    setDataNote(null);
    isCancelledRef.current = false;

    const progressRef = { current: null as ProgressCallbackData | null };

    try {
      const scraped = await executeScrapingJob(
        effectiveOptions,
        (progress) => {
          progressRef.current = progress;
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
            setBusinesses(prev => [progress.newPlace!, ...prev]);
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
            scrapedCount: scraped.length,
            finishedAt: finishTime,
            results: scraped
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
      }
    } catch (err) {
      setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, status: 'failed' } : j)));
      setScrapeError(err instanceof Error ? err.message : 'Cào thất bại');
    } finally {
      setActiveJobId(null);
      setJobProgress(null);
    }
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

  const handleSelectJobResults = (jobResults: ScrapedBusiness[]) => {
    setBusinesses(jobResults);
    setActiveTab('leads');
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewJob={() => setIsScraperModalOpen(true)}
        onExportClick={() => setIsExportModalOpen(true)}
        onOpenGuide={(guideId) => setActiveGuideId(guideId)}
        totalLeadsCount={businesses.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 sm:p-6 flex flex-col">
        {/* Direct Scrape Input Bar (Always Visible: Industry + Location/Coordinates + Scrape Button) */}
        <DirectScrapeBar
          existingBusinesses={businesses}
          onStartScrape={handleStartScrape}
          isRunning={Boolean(activeJobId)}
          onOpenAdvancedModal={() => setIsScraperModalOpen(true)}
          proxyCount={parseProxies(proxiesText).length}
          onOpenGuide={(guideId) => setActiveGuideId(guideId)}
        />

        {dataNote && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/40 rounded-lg text-xs text-blue-200 flex items-start justify-between gap-3">
            <span>📦 {dataNote}</span>
            <button type="button" onClick={() => setDataNote(null)} className="text-blue-300 hover:text-white shrink-0">Đóng</button>
          </div>
        )}

        {scrapeError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/40 rounded-lg text-xs text-red-200 flex items-start justify-between gap-3">
            <span><strong>Cào thất bại:</strong> {scrapeError}</span>
            <button type="button" onClick={() => setScrapeError(null)} className="text-red-300 hover:text-white shrink-0">Đóng</button>
          </div>
        )}

        {/* Active Scraping Progress Tracker & Completion Banner */}
        <JobProgressBanner
          progress={jobProgress}
          isRunning={Boolean(activeJobId)}
          completionSummary={completionSummary}
          onCancel={handleCancelScrape}
          onCloseCompletion={() => setCompletionSummary(null)}
          onExportCsv={(results) => exportToCsv(results, `gmaps_leads_hoan_thanh_${Date.now()}.csv`)}
          onOpenOutreach={(results) => setOutreachLeads(results)}
          onViewOnMap={() => setActiveTab('map')}
          onOpenGuide={(guideId) => setActiveGuideId(guideId)}
        />

        {/* Tab 1: Leads Data Explorer */}
        {activeTab === 'leads' && (
          <div className="space-y-4 flex-1 flex flex-col">
            <DataTable
              businesses={businesses}
              onSelectBusiness={(biz) => setSelectedBusiness(biz)}
              onOpenOutreachModal={(selected) => setOutreachLeads(selected)}
              onOpenGuide={(guideId) => setActiveGuideId(guideId)}
            />
          </div>
        )}

        {/* Tab 2: Live Map View */}
        {activeTab === 'map' && (
          <div className="space-y-4">
            <MapView
              businesses={businesses}
              onSelectBusiness={(biz) => setSelectedBusiness(biz)}
              onOpenGuide={(guideId) => setActiveGuideId(guideId)}
            />
          </div>
        )}

        {/* Tab 3: Scraping Jobs & Queue Runner */}
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <JobsRunnerView
              jobs={jobs}
              activeJobId={activeJobId}
              onOpenNewJob={() => setIsScraperModalOpen(true)}
              onSelectJobResults={handleSelectJobResults}
              onDeleteJob={handleDeleteJob}
              onOpenGuide={(guideId) => setActiveGuideId(guideId)}
            />
          </div>
        )}

        {/* Tab 4: Lead Analytics & Metrics */}
        {activeTab === 'analytics' && (
          <div className="space-y-4">
            <AnalyticsView
              businesses={businesses}
              onOpenOutreachModal={(leads) => setOutreachLeads(leads)}
              onOpenGuide={(guideId) => setActiveGuideId(guideId)}
            />
          </div>
        )}

        {/* Tab 5: REST API & CLI Documentation */}
        {activeTab === 'api' && (
          <div className="space-y-4">
            <ApiDocsModal onOpenGuide={(guideId) => setActiveGuideId(guideId)} />
          </div>
        )}
      </main>

      {/* Scraper Configuration Modal */}
      {isScraperModalOpen && (
        <ScraperControls
          isModal={true}
          proxiesText={proxiesText}
          onChangeProxies={setProxiesText}
          isRunning={Boolean(activeJobId)}
          onStartScrape={handleStartScrape}
          onClose={() => setIsScraperModalOpen(false)}
          onOpenGuide={(guideId) => setActiveGuideId(guideId)}
        />
      )}

      {/* Inspect Lead Drawer */}
      <LeadDrawer
        business={selectedBusiness}
        onClose={() => setSelectedBusiness(null)}
        onOpenOutreach={(biz) => {
          setSelectedBusiness(null);
          setOutreachLeads([biz]);
        }}
        onOpenGuide={(guideId) => setActiveGuideId(guideId)}
      />

      {/* Outreach Email Composer Modal */}
      {outreachLeads && (
        <OutreachModal
          leads={outreachLeads}
          onClose={() => setOutreachLeads(null)}
          onOpenGuide={(guideId) => setActiveGuideId(guideId)}
        />
      )}

      {/* Export Options Modal */}
      {isExportModalOpen && (
        <ExportModal
          businesses={businesses}
          onClose={() => setIsExportModalOpen(false)}
          onOpenGuide={(guideId) => setActiveGuideId(guideId)}
        />
      )}

      {/* Module Help Guide Modal */}
      {activeGuideId && (
        <ModuleHelpModal
          guideId={activeGuideId}
          onClose={() => setActiveGuideId(null)}
          onSelectGuide={(id) => setActiveGuideId(id)}
        />
      )}
    </div>
  );
}
