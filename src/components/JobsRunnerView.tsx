import React from 'react';
import { Trash2, Download, CheckCircle2, Clock, Zap } from 'lucide-react';
import { ScraperJob, ScrapedBusiness } from '../types/scraper';
import { exportToCsv } from '../services/exporter';

interface JobsRunnerViewProps {
  jobs: ScraperJob[];
  activeJobId: string | null;
  onOpenNewJob: () => void;
  onSelectJobResults: (jobResults: ScrapedBusiness[]) => void;
  onDeleteJob: (jobId: string) => void;
  onOpenTrash: () => void;
}

export const JobsRunnerView: React.FC<JobsRunnerViewProps> = ({
  jobs,
  activeJobId,
  onOpenNewJob,
  onSelectJobResults,
  onDeleteJob,
  onOpenTrash
}) => {
  return (
    <div className="space-y-5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white">Lịch sử tìm kiếm</h2>
        <button
          onClick={onOpenNewJob}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md text-xs transition-colors"
        >
          Tìm lead mới
        </button>
      </div>

      {/* Jobs Grid / List */}
      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="p-12 text-center bg-slate-950 border border-slate-800 rounded-lg text-slate-400">
            <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">Chưa có lần tìm nào</p>
            <button
              onClick={onOpenNewJob}
              className="mt-3 px-3 py-1.5 bg-blue-600 text-white font-medium rounded text-xs"
            >
              Tìm lead đầu tiên
            </button>
          </div>
        ) : (
          jobs.map((job) => {
            const isCurrentActive = job.id === activeJobId;

            return (
              <div
                key={job.id}
                className={`bg-slate-950 border rounded-lg p-4 transition-all ${
                  isCurrentActive ? 'border-blue-500 shadow-md ring-1 ring-blue-500/20' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded ${
                      job.status === 'completed'
                        ? 'bg-emerald-950/60 text-emerald-400'
                        : job.status === 'running'
                        ? 'bg-blue-950/60 text-blue-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {job.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-sm">{job.name}</h3>
                        <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                          [{job.status === 'completed' ? 'Hoàn thành' : job.status === 'running' ? 'Đang chạy' : job.status === 'failed' ? 'Thất bại' : 'Đã dừng'}]
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{job.results.length} lead</span>
                        <span>·</span>
                        <span>{job.startedAt}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectJobResults(job.results)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition-colors flex items-center gap-1"
                    >
                      <span>Xem lead</span>
                    </button>

                    <button
                      onClick={() => exportToCsv(job.results, `${job.query.replace(/[^a-zA-Z0-9]/g, '_')}_leads.csv`)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded transition-colors"
                      title="Tải file CSV của tác vụ này"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteJob(job.id)}
                      className="p-1.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 rounded transition-colors"
                      title="Xóa tác vụ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      <div className="text-right">
        <button type="button" onClick={onOpenTrash} className="text-[11px] text-slate-400 hover:text-white underline">Khôi phục lần tìm đã xóa</button>
      </div>
    </div>
  );
};
