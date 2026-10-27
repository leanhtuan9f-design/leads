import { useEffect, useState } from 'react';
import { apiJson } from '../auth/types';
import { useRouteSegment } from '../utils/routeSegment';

type Summary = {
  shipments: { n: number; usd: number | null; minDate: string | null; maxDate: string | null };
  buyers: number; rankings: number; market: number; directory: number; files: number;
  topCountries: { country: string; shipments: number; usd: number | null }[];
  directoryTypes: { type: string; n: number }[];
  products: ProductStat[];
};
type ProductStat = { key: string; label: string; shipments: number; usd: number | null; shipmentBuyers: number; rankings: number; market: number };
type Paged<T> = { total: number; limit: number; offset: number; rows: T[] };
type Row = Record<string, string | number | string[] | null>;
type View = 'overview' | 'buyers' | 'shipments' | 'directory';

const VIEWS = ['overview', 'buyers', 'shipments', 'directory'] as const;
const TYPE_LABEL: Record<string, string> = {
  importer: 'Nhà nhập khẩu / buyer', supplier: 'Nhà cung cấp', manufacturer: 'Nhà máy', shipper: 'Shipper / forwarder',
  registry: 'Đăng ký doanh nghiệp', vendor: 'Vendor', document: 'Trích từ PDF/DOC (độ tin cậy thấp)', contact: 'Khác', competitor: 'Đối thủ'
};
const COLUMNS: Record<Exclude<View, 'overview'>, [string, string][]> = {
  buyers: [['name', 'Buyer'], ['country', 'Nước'], ['transactions', 'Giao dịch'], ['usd', 'USD'], ['lastDate', 'Gần nhất'], ['products', 'Sản phẩm'], ['hs', 'HS'], ['sources', 'Nguồn']],
  shipments: [['date', 'Ngày'], ['buyer', 'Buyer'], ['buyerCountry', 'Nước'], ['supplier', 'Nhà cung cấp VN'], ['group', 'Sản phẩm'], ['hs', 'HS'], ['usd', 'USD'], ['qty', 'SL'], ['unit', 'ĐV'], ['portIn', 'Cảng đến']],
  directory: [['name', 'Tên'], ['type', 'Loại'], ['country', 'Nước'], ['city', 'Thành phố'], ['email', 'Email'], ['phone', 'Điện thoại'], ['website', 'Website'], ['activity', 'Ngành / ghi chú']]
};
const fmt = (v: unknown) => Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? v.toLocaleString('vi-VN') : String(v ?? '');
const input = 'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 placeholder:text-slate-500';

function Table({ view, products, initialProduct = '', onProductChange }: { view: Exclude<View, 'overview'>; products: ProductStat[]; initialProduct?: string; onProductChange?: (key: string) => void }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [hs, setHs] = useState('');
  const [product, setProduct] = useState(initialProduct);
  const [type, setType] = useState('');
  const [hasEmail, setHasEmail] = useState(false);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<Row> | null>(null);
  const [error, setError] = useState('');
  const limit = 50;
  useEffect(() => { setOffset(0); }, [q, country, hs, type, hasEmail, product, view]);
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (q.trim()) p.set('q', q.trim());
      if (country.trim()) p.set('country', country.trim());
      if (hs.trim() && view !== 'directory') p.set('hs', hs.trim());
      if (type && view === 'directory') p.set('type', type);
      if (hasEmail && view === 'directory') p.set('hasEmail', '1');
      if (product && view !== 'directory') p.set('product', product);
      try {
        const res = await fetch(`/api/admin/customs/${view}?${p}`, { credentials: 'same-origin', signal: ctl.signal });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error || `Lỗi ${res.status}`);
        setData(body as Paged<Row>); setError('');
      } catch (e) { if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được dữ liệu'); }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, country, hs, type, hasEmail, product, offset, view]);
  return <div className="mt-3">
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${input} w-56`} placeholder="Tìm theo tên" value={q} onChange={e => setQ(e.target.value)} aria-label="Tìm theo tên" />
      <input className={`${input} w-24`} placeholder="Nước (US)" maxLength={2} value={country} onChange={e => setCountry(e.target.value.toUpperCase())} aria-label="Mã nước" />
      {view !== 'directory' && <select className={input} value={product} onChange={e => { setProduct(e.target.value); onProductChange?.(e.target.value); }} aria-label="Sản phẩm"><option value="">Mọi sản phẩm</option>{products.map(p => <option key={p.key} value={p.key}>{p.label} ({(view === 'buyers' ? p.shipmentBuyers + p.rankings : p.shipments).toLocaleString('vi-VN')})</option>)}</select>}
      {view !== 'directory' && <input className={`${input} w-28`} placeholder="Mã HS" value={hs} onChange={e => setHs(e.target.value)} aria-label="Mã HS" />}
      {view === 'directory' && <select className={input} value={type} onChange={e => setType(e.target.value)} aria-label="Loại"><option value="">Mọi loại</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      {view === 'directory' && <label className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={hasEmail} onChange={e => setHasEmail(e.target.checked)} />Có email</label>}
      {data && <span className="text-[11px] text-slate-400">{data.total.toLocaleString('vi-VN')} kết quả</span>}
    </div>
    {error && <p className="mt-3 text-amber-300" role="status">{error}</p>}
    {!data && !error && <p className="mt-3 text-slate-400" role="status">Đang tải…</p>}
    {data && <div className="mt-3 overflow-x-auto rounded border border-slate-800">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-900 text-slate-400"><tr>{COLUMNS[view].map(([, label]) => <th key={label} className="px-2 py-1.5 font-medium whitespace-nowrap">{label}</th>)}</tr></thead>
        <tbody>{data.rows.map((row, i) => <tr key={i} className="border-t border-slate-800 text-slate-200 hover:bg-slate-900/60">
          {COLUMNS[view].map(([key]) => <td key={key} className="max-w-xs truncate px-2 py-1" title={fmt(key === 'type' ? TYPE_LABEL[String(row.type)] ?? row.type : row[key])}>{fmt(key === 'type' ? TYPE_LABEL[String(row.type)] ?? row.type : row[key])}</td>)}
        </tr>)}{data.rows.length === 0 && <tr><td colSpan={COLUMNS[view].length} className="px-2 py-4 text-center text-slate-500">Không có dữ liệu khớp bộ lọc.</td></tr>}</tbody>
      </table>
    </div>}
    {data && <div className="mt-2 flex items-center gap-2 text-slate-300">
      <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Trước</button>
      <span className="text-[11px] text-slate-400">{data.total ? offset + 1 : 0}–{Math.min(offset + limit, data.total)} / {data.total.toLocaleString('vi-VN')}</span>
      <button type="button" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Sau</button>
    </div>}
  </div>;
}

export function AdminCustomsView() {
  const [routeView, setView] = useRouteSegment<View>('customs-data', [], VIEWS);
  const view = routeView ?? 'overview';
  const [product, setProduct] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    apiJson<Summary>('/admin/customs/summary').then(r => { if (active) setSummary(r); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được tổng quan'); });
    return () => { active = false; };
  }, []);
  const tab = (id: View, label: string) => <button type="button" onClick={() => setView(id)} className={`rounded px-3 py-1 ${view === id ? 'bg-slate-700 font-medium text-white' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>;
  return <div className="max-w-6xl text-xs">
    <h2 className="text-sm font-bold text-white">Customs Data</h2>
    <p className="mt-1 text-[11px] text-slate-400">Dữ liệu hải quan/vận đơn thật nhập từ nguồn ngoài, tách khỏi kho Google Maps. Danh bạ doanh nghiệp là bộ riêng, chưa xác minh hoạt động nhập khẩu. Chỉ admin xem được.</p>
    <div className="mt-3 flex flex-wrap gap-1 rounded bg-slate-900 p-1 w-fit">{tab('overview', 'Tổng quan')}{tab('buyers', 'Buyer hải quan')}{tab('shipments', 'Vận đơn')}{tab('directory', 'Danh bạ doanh nghiệp')}</div>
    {view === 'overview' && <section className="mt-3">
      {error && <p className="text-amber-300" role="status">{error}</p>}
      {!summary && !error && <p className="text-slate-400" role="status">Đang tải…</p>}
      {summary && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Dòng vận đơn', summary.shipments.n], ['Buyer (vận đơn)', summary.buyers], ['Dòng xếp hạng buyer/supplier', summary.rankings], ['Danh bạ doanh nghiệp', summary.directory]].map(([label, n]) =>
            <article key={String(label)} className="rounded border border-slate-800 bg-slate-950 p-3"><strong className="font-mono text-xl text-white">{Number(n).toLocaleString('vi-VN')}</strong><h4 className="mt-1 text-slate-300">{label}</h4></article>)}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Vận đơn từ {summary.shipments.minDate || '—'} đến {summary.shipments.maxDate || '—'} · {summary.files.toLocaleString('vi-VN')} tệp nguồn · {summary.market.toLocaleString('vi-VN')} dòng thống kê thị trường.</p>
        <div className="mt-4 rounded border border-slate-800 bg-slate-950 p-3">
          <h3 className="font-semibold text-white">Theo sản phẩm</h3>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[11px]">
            <thead className="text-slate-400"><tr><th className="py-1 font-medium">Sản phẩm</th><th className="font-medium">Dòng vận đơn</th><th className="font-medium">Buyer (vận đơn)</th><th className="font-medium">USD (vận đơn)</th><th className="font-medium">Dòng xếp hạng</th><th className="font-medium">Thị trường</th></tr></thead>
            <tbody>{summary.products.map(p => <tr key={p.key} className="border-t border-slate-800 text-slate-300">
              <td className="py-1"><button type="button" className="text-sky-300 hover:underline" onClick={() => { setProduct(p.key); setView('buyers'); }}>{p.label}</button></td>
              <td className="font-mono">{p.shipments.toLocaleString('vi-VN')}</td><td className="font-mono">{p.shipmentBuyers.toLocaleString('vi-VN')}</td><td className="font-mono">{p.usd == null ? '—' : p.usd.toLocaleString('vi-VN')}</td><td className="font-mono">{p.rankings.toLocaleString('vi-VN')}</td><td className="font-mono">{p.market.toLocaleString('vi-VN')}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded border border-slate-800 bg-slate-950 p-3"><h3 className="font-semibold text-white">Top nước nhận hàng</h3><ul className="mt-2 space-y-1 text-slate-300">{summary.topCountries.map(c => <li key={c.country} className="flex justify-between"><span>{c.country}</span><span className="font-mono">{c.shipments.toLocaleString('vi-VN')} lô</span></li>)}</ul></div>
          <div className="rounded border border-slate-800 bg-slate-950 p-3"><h3 className="font-semibold text-white">Danh bạ theo loại</h3><ul className="mt-2 space-y-1 text-slate-300">{summary.directoryTypes.map(t => <li key={t.type} className="flex justify-between"><span>{TYPE_LABEL[t.type] ?? t.type}</span><span className="font-mono">{t.n.toLocaleString('vi-VN')}</span></li>)}</ul></div>
        </div>
      </>}
    </section>}
    {view !== 'overview' && <Table key={view} view={view} products={summary?.products ?? []} initialProduct={product} onProductChange={setProduct} />}
  </div>;
}
