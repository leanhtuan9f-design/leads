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
}

const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500';

// Cấu hình kết nối AI tùy chỉnh (chỉ admin): Base URL (http/https), API key, model tải tự động hoặc nhập tay
export const AiSettings: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [loaded, setLoaded] = useState(false);
  const [format, setFormat] = useState<'anthropic' | 'openai'>('anthropic');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ hasKey: boolean; keyHint: string; keySource: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'test' | 'save'>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (c: AiConfigView) => {
    setFormat(c.format); setBaseUrl(c.baseUrl); setModel(c.model);
    setMeta({ hasKey: c.hasKey, keyHint: c.keyHint, keySource: c.keySource });
  };

  useEffect(() => {
    apiJson<AiConfigView>('/admin/ai-config').then((c) => { apply(c); setLoaded(true); })
      .catch((e) => { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Lỗi tải cấu hình' }); setLoaded(true); });
  }, []);

  const test = async () => {
    setBusy('test'); setMsg(null);
    try {
      const r = await apiJson<{ models: string[] }>('/admin/ai-config/models', 'POST', { format, baseUrl, apiKey });
      setModels(r.models);
      if (!model && r.models.length) setModel(r.models[0]);
      setMsg({ ok: true, text: `Kết nối thành công — ${r.models.length} model. Chọn trong ô Model hoặc nhập tay.` });
    } catch (e) {
      setModels([]);
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Kết nối thất bại' });
    } finally { setBusy(''); }
  };

  const save = async (clearKey = false) => {
    setBusy('save'); setMsg(null);
    try {
      const c = await apiJson<AiConfigView>('/admin/ai-config', 'PUT', { format, baseUrl, model, apiKey, clearKey });
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
          {busy === 'test' ? 'Đang kết nối…' : 'Kết nối & tải model'}
        </button>
        <span className="text-slate-500">Thành công thì danh sách model tự điền vào ô bên dưới.</span>
      </div>
      <label className="block">
        <span className="text-slate-400">Model{models.length ? ` (${models.length} model từ máy chủ — chọn hoặc nhập tay)` : ' (nhập tay hoặc bấm “Kết nối & tải model”)'}</span>
        <input list="ai-model-list" value={model} onChange={(e) => setModel(e.target.value)} placeholder={format === 'anthropic' ? 'claude-haiku-5-5' : 'tên model, ví dụ gpt-4o-mini'} className={`${inputCls} font-mono`} autoComplete="off" spellCheck={false} />
        <datalist id="ai-model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
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
