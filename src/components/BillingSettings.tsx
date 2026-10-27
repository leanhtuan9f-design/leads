import React, { useEffect, useState } from 'react';
import { apiJson } from '../auth/types';

type Plan = { dailyNew: number; dailyRefresh: number; maxCountries: number; maxConcurrentSearches: number; dailySearches: number };
type PlanKey = 'BASIC' | 'ADVANCED';
type Config = { sourceKey: string; skus: Record<string, string>; plans: Record<PlanKey, Plan>; prices: Record<PlanKey, { MONTHLY: number; ANNUAL: number }>; features: Record<PlanKey, string[]>; hasCheckoutApiKey: boolean; hasWebsiteKey: boolean; hasCallbackKey: boolean };
const fields = ['BASIC_MONTHLY', 'BASIC_ANNUAL', 'ADVANCED_MONTHLY', 'ADVANCED_ANNUAL'];
const input = 'w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-white font-mono';

export function BillingSettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); setMsg(''); try { setConfig(await apiJson<Config>('/admin/billing-config')); } catch (e) { setMsg(e instanceof Error ? e.message : 'Không tải được cấu hình'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!config) return; setBusy(true); setMsg('');
    try { setConfig(await apiJson<Config>('/admin/billing-config', 'PUT', config)); setMsg('Đã lưu cấu hình gói dịch vụ.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Lưu thất bại'); } finally { setBusy(false); }
  };
  if (loading) return <div className="text-slate-500">Đang tải cấu hình thanh toán…</div>;
  if (!config) return <div className="space-y-3"><div className="text-red-300">{msg || 'Không tải được cấu hình thanh toán.'}</div><button type="button" onClick={() => { void load(); }} className="rounded bg-slate-800 px-3 py-1.5 text-white">Thử lại</button><p className="text-slate-500">Nếu báo 404, backend production chưa được deploy bản có endpoint cấu hình thanh toán.</p></div>;
  return <form onSubmit={save} className="space-y-4">
    <div><h2 className="text-sm font-bold text-white">Cấu hình thanh toán Central CRM</h2><p className="mt-1 text-slate-500">Chỉ nhập các mã đã tồn tại trong CRM. Màn hình này không tạo sản phẩm hay payment config mới.</p></div>
    <label className="block"><span className="text-slate-400">Source Registry key hiện có</span><input required value={config.sourceKey} onChange={e => setConfig({ ...config, sourceKey: e.target.value })} className={input} placeholder="copy từ CRM → Source Registry" /></label>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(key => <label key={key} className="block"><span className="text-slate-400">SKU {key.replace('_', ' · ')}</span><input required value={config.skus[key] || ''} onChange={e => setConfig({ ...config, skus: { ...config.skus, [key]: e.target.value } })} className={input} placeholder="copy nguyên văn từ CRM" /></label>)}</div>
    <div className="grid gap-3 sm:grid-cols-2">{(['BASIC', 'ADVANCED'] as const).map(plan => <fieldset key={plan} className="rounded border border-slate-800 p-3"><legend className="px-1 font-semibold text-white">Gói {plan}</legend><label className="block"><span className="text-slate-400">Lead mới mỗi ngày</span><input type="number" min="0" value={config.plans[plan].dailyNew} onChange={e => setConfig({ ...config, plans: { ...config.plans, [plan]: { ...config.plans[plan], dailyNew: Number(e.target.value) } } })} className={input} /></label><div className="mt-3 rounded border border-slate-800 bg-slate-900/40 p-2"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cấu hình tìm kiếm · 0 = không giới hạn</h3><div className="mt-2 grid gap-2">{([['maxCountries', 'Số quốc gia được chọn'], ['maxConcurrentSearches', 'Số search chạy cùng lúc'], ['dailySearches', 'Số lượt search mỗi ngày']] as const).map(([field, label]) => <label key={field} className="block"><span className="text-slate-400">{label}</span><input type="number" min="0" value={config.plans[plan][field] ?? 0} onChange={e => setConfig({ ...config, plans: { ...config.plans, [plan]: { ...config.plans[plan], [field]: Number(e.target.value) } } })} className={input} /></label>)}</div></div>
    <label className="mt-2 block"><span className="text-slate-400">Lượt refresh mỗi ngày</span><input type="number" min="0" value={config.plans[plan].dailyRefresh} onChange={e => setConfig({ ...config, plans: { ...config.plans, [plan]: { ...config.plans[plan], dailyRefresh: Number(e.target.value) } } })} className={input} /></label><div className="mt-2 grid grid-cols-2 gap-2"><label><span className="text-slate-400">Giá tháng</span><input type="number" min="0" value={config.prices?.[plan]?.MONTHLY ?? 0} onChange={e => setConfig({ ...config, prices: { ...config.prices, [plan]: { ...config.prices[plan], MONTHLY: Number(e.target.value) } } })} className={input} /></label><label><span className="text-slate-400">Giá năm</span><input type="number" min="0" value={config.prices?.[plan]?.ANNUAL ?? 0} onChange={e => setConfig({ ...config, prices: { ...config.prices, [plan]: { ...config.prices[plan], ANNUAL: Number(e.target.value) } } })} className={input} /></label></div><label className="mt-2 block"><span className="text-slate-400">Tính năng (mỗi dòng một tính năng)</span><textarea rows={5} value={(config.features?.[plan] || []).join('\n')} onChange={e => setConfig({ ...config, features: { ...config.features, [plan]: e.target.value.split('\n') } })} className={`${input} resize-y`} /></label></fieldset>)}</div>
    <div className="rounded border border-slate-800 bg-slate-900/50 p-3 text-slate-400">Checkout API key: {config.hasCheckoutApiKey ? <span className="text-emerald-300">đã có</span> : <span className="text-amber-300">chưa có trong .env</span>} · Website key: {config.hasWebsiteKey ? <span className="text-emerald-300">đã có</span> : <span className="text-amber-300">chưa có</span>} · Callback secret: {config.hasCallbackKey ? <span className="text-emerald-300">đã có</span> : <span className="text-slate-500">không bắt buộc nếu polling</span>}</div>
    {msg && <div className="text-emerald-300">{msg}</div>}<button disabled={busy} className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
  </form>;
}
