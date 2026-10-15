import React, { useEffect, useState } from 'react';
import { apiJson } from '../auth/types';

interface AiConfigView {
  format: 'anthropic' | 'openai';
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyHint: string;
  keySource: 'db' | 'env' | 'none';
  enabled: boolean;
  systemPrompt: string;
  customPrompt: boolean;
  defaultPrompt: string;
  fixedSuffix: string;
}

interface TestReport { models: string[]; modelsError: string; chatOk: boolean; chatError: string; reply: string; ms: number; model: string }

const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500';

// Cấu hình kết nối AI tùy chỉnh (chỉ admin): Base URL (http/https), API key, model tải tự động hoặc nhập tay
export const AiSettings: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [loaded, setLoaded] = useState(false);
  const [format, setFormat] = useState<'anthropic' | 'openai'>('anthropic');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [defaults, setDefaults] = useState({ prompt: '', suffix: '', custom: false });
  const [models, setModels] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ hasKey: boolean; keyHint: string; keySource: string } | null>(null);
  const [report, setReport] = useState<TestReport | null>(null);
  const [busy, setBusy] = useState<'' | 'test' | 'save'>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (c: AiConfigView) => {
    setFormat(c.format); setBaseUrl(c.baseUrl); setModel(c.model);
    setPrompt(c.systemPrompt); setDefaults({ prompt: c.defaultPrompt, suffix: c.fixedSuffix, custom: c.customPrompt });
    setMeta({ hasKey: c.hasKey, keyHint: c.keyHint, keySource: c.keySource });
  };

  useEffect(() => {
    apiJson<AiConfigView>('/admin/ai-config').then((c) => { apply(c); setLoaded(true); })
      .catch((e) => { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Lỗi tải cấu hình' }); setLoaded(true); });
  }, []);

  const test = async () => {
    setBusy('test'); setMsg(null); setReport(null);
    try {
      const r = await apiJson<TestReport>('/admin/ai-config/test', 'POST', { format, baseUrl, apiKey, model });
      setModels(r.models);
      if (!model && r.model) setModel(r.model);
      setReport(r);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Kết nối thất bại' });
    } finally { setBusy(''); }
  };

  const save = async (clearKey = false) => {
    setBusy('save'); setMsg(null);
    try {
      const c = await apiJson<AiConfigView>('/admin/ai-config', 'PUT', { format, baseUrl, model, apiKey, clearKey, systemPrompt: prompt });
      apply(c); setApiKey('');
      setMsg({ ok: true, text: c.enabled ? 'Đã lưu. Tính năng gợi ý AI đang bật.' : 'Đã lưu, nhưng còn thiếu API key hoặc model nên AI chưa bật.' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Lưu thất bại' });
    } finally { setBusy(''); }
  };

  if (!loaded) return <div className="text-slate-500">Đang tải cấu hình…</div>;

  const keyPlaceholder = meta?.hasKey
    ? `Đã lưu ••••${meta.keyHint}${meta.keySource === 'env' ? ' (từ .env)' : ''} — để trống để giữ nguyên`
    : 'Dán API key';

  return (
    <div className="space-y-2.5 mt-3 pt-3 border-t border-slate-800">
      <div className="font-semibold text-white">Kết nối AI (tùy chỉnh)</div>
      <label className="block">
        <span className="text-slate-400">Kiểu API</span>
        <select value={format} onChange={(e) => { setFormat(e.target.value as 'anthropic' | 'openai'); setModels([]); }} className={inputCls}>
          <option value="anthropic">Anthropic (Claude, /v1/messages)</option>
          <option value="openai">OpenAI-compatible (/v1/chat/completions)</option>
        </select>
      </label>
      <label className="block">
        <span className="text-slate-400">Base URL — chấp nhận http:// và https://{format === 'anthropic' ? ' (để trống = api.anthropic.com)' : ''}</span>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={format === 'openai' ? 'http://192.168.1.10:8000/v1' : 'https://api.anthropic.com'} className={`${inputCls} font-mono`} autoComplete="off" spellCheck={false} />
      </label>
      <label className="block">
        <span className="text-slate-400">API key</span>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={keyPlaceholder} className={`${inputCls} font-mono`} autoComplete="new-password" />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={test} disabled={busy !== ''} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded disabled:opacity-50">
          {busy === 'test' ? 'Đang thử kết nối…' : 'Test kết nối'}
        </button>
        <span className="text-slate-500">Tải danh sách model và gọi thử model một câu ngắn.</span>
      </div>
      <div className="block">
        <span className="text-slate-400">Model{models.length ? ` — ${models.length} model từ máy chủ, chọn trong danh sách hoặc nhập tay` : ' — nhập tay hoặc bấm “Test kết nối” để tải danh sách'}</span>
        {models.length > 0 && (
          <select value={models.includes(model) ? model : ''} onChange={(e) => { if (e.target.value) setModel(e.target.value); }} className={`${inputCls} font-mono mb-1.5`}>
            <option value="">— Chọn model —</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={format === 'anthropic' ? 'claude-haiku-5-5' : 'tên model, ví dụ gpt-4o-mini'} className={`${inputCls} font-mono`} autoComplete="off" spellCheck={false} />
        {models.length > 0 && model && !models.includes(model) && (
          <div className="text-amber-300 mt-1">Model “{model}” không có trong danh sách của máy chủ — hãy chọn một model ở trên.</div>
        )}
      </div>
      <div className="block">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">System prompt — gợi ý quốc gia + từ khóa (1 lần gọi AI){defaults.custom ? ' — đang dùng bản tùy chỉnh' : ' — đang dùng mặc định'}</span>
          <button type="button" onClick={() => setPrompt(defaults.prompt)} disabled={prompt === defaults.prompt} className="text-blue-300 hover:text-blue-200 disabled:text-slate-600">Khôi phục mặc định</button>
        </div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={16} maxLength={6000} spellCheck={false} className={`${inputCls} font-mono text-[11px] leading-relaxed mt-1`} />
        <details className="mt-1 text-slate-500">
          <summary className="cursor-pointer">Phần cố định luôn được nối vào cuối prompt (không sửa được)</summary>
          <pre className="whitespace-pre-wrap font-mono text-[11px] mt-1 p-2 bg-slate-900/60 border border-slate-800 rounded">{defaults.suffix}</pre>
        </details>
        <p className="text-slate-500 mt-1">Hồ sơ người dùng được gửi kèm trong thẻ <code className="font-mono">&lt;profile&gt;</code>. Lưu prompt mới sẽ làm các gợi ý đã lưu của mọi người dùng cũ đi (lần gợi ý kế tiếp gọi lại AI).</p>
      </div>
      {report && (
        <div className="p-2 rounded border border-slate-700 bg-slate-900/60 space-y-0.5">
          <div className={report.models.length ? 'text-emerald-300' : 'text-amber-300'}>
            {report.models.length ? `✓ Tải được ${report.models.length} model` : `⚠ Không tải được danh sách model${report.modelsError ? `: ${report.modelsError}` : ''}`}
          </div>
          <div className={report.chatOk ? 'text-emerald-300' : 'text-red-300'}>
            {report.chatOk ? `✓ Gọi thử “${report.model}” thành công (${report.ms} ms)${report.reply ? ` — trả lời: ${report.reply}` : ''}` : `✕ Gọi thử thất bại: ${report.chatError}`}
          </div>
        </div>
      )}
      {msg && <div className={msg.ok ? 'text-emerald-300' : 'text-red-300'}>{msg.text}</div>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => save()} disabled={busy !== ''} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium disabled:opacity-50">
          {busy === 'save' ? 'Đang lưu…' : 'Lưu cấu hình'}
        </button>
        {meta?.keySource === 'db' && (
          <button type="button" onClick={() => { if (window.confirm('Xóa API key đã lưu?')) save(true); }} disabled={busy !== ''} className="px-3 py-1.5 text-red-300 hover:text-red-200 disabled:opacity-50">
            Xóa key
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500">API key lưu trong cơ sở dữ liệu của máy chủ, không hiển thị lại và không gửi về trình duyệt. Tin nhắn gửi tới máy chủ AI chứa hồ sơ người dùng đã nhập.</p>
    </div>
  );
};
