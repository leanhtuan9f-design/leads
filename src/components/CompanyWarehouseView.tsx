import { useEffect, useRef, useState } from 'react';
import { apiJson } from '../auth/types';

type Company = { id: string; name: string; country: string; city: string; role: string; source: string; sources?: string; contacts?: string; confidence: string; linked?: number };
type Paged<T> = { total: number; limit: number; offset: number; rows: T[] };
type Summary = { profiles: number; roots: number; linked: number; facts: number; pending: number; lastSync: { status: string; finished_at: number | null; error?: string } | null; countries: { country: string; n: number }[]; products: { product: string; n: number }[] };
type Candidate = { id: number; left_id: string; right_id: string; left_name: string; right_name: string; left_source: string; right_source: string; country: string; status: string; signals: string; revision: string; evidence_changed: number; left_confidence: string; right_confidence: string };
type Fact = { id: string; source: string; role: string; product: string; hs: string; trade_date: string; imported_at: number; payload: Record<string, unknown> };
type Detail = { company: Company; profiles: Company[]; contacts: { kind: string; value: string; source: string; fact_id: string }[]; facts: Fact[]; totals: { source: string; role: string; rows: number; firstDate: string; lastDate: string }[]; total: number; offset: number; limit: number };
type History = { action: string; actor: number; reason: string; at: number };
const SOURCE: Record<string, string> = { maps: 'Maps', directory: 'Danh bạ', shipments: 'Vận đơn', rankings: 'Xếp hạng' };
const ROLE: Record<string, string> = { location: 'Địa điểm Maps', buyer: 'Buyer', supplier: 'Supplier', importer: 'Importer', manufacturer: 'Nhà sản xuất', shipper: 'Shipper', registry: 'Đăng ký', vendor: 'Vendor', document: 'Trích tài liệu', competitor: 'Đối thủ', contact: 'Liên hệ' };
const STATUS: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã gộp', rejected: 'Đã từ chối', completed: 'Hoàn tất', running: 'Đang đồng bộ', interrupted: 'Bị gián đoạn', failed: 'Thất bại' };
const field = 'rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 min-w-0';
const button = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed';
const fmt = (n: number) => n.toLocaleString('vi-VN');
const date = (n?: number | null) => n ? new Date(n).toLocaleString('vi-VN') : '—';
function Pager({ offset, total, onPage }: { offset: number; total: number; onPage: (n: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-slate-400">
    <span>{total ? `${fmt(offset + 1)}–${fmt(Math.min(offset + 50, total))} / ${fmt(total)}` : 'Chưa có kết quả'}</span>
    <div className="flex gap-2"><button className={button} disabled={!offset} onClick={() => onPage(Math.max(0, offset - 50))}>Trước</button><button className={button} disabled={offset + 50 >= total} onClick={() => onPage(offset + 50)}>Sau</button></div>
  </div>;
}

export function CompanyWarehouseView() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [view, setView] = useState<'list' | 'review'>('list');
  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { q: '', country: params.get('country') || '', city: '', source: '', role: '', contact: '', product: params.get('product') || '', hs: params.get('hs') || '', linked: '' };
  });
  const [status, setStatus] = useState('pending'); const [offset, setOffset] = useState(0);
  const [companies, setCompanies] = useState<Paged<Company> | null>(null);
  const [candidates, setCandidates] = useState<Paged<Candidate> | null>(null);
  const [revision, setRevision] = useState(0); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [selected, setSelected] = useState(''); const [detail, setDetail] = useState<Detail | null>(null); const [factOffset, setFactOffset] = useState(0);
  const [detailError, setDetailError] = useState(''); const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState<Candidate | null>(null); const [history, setHistory] = useState<History[]>([]);
  const [reason, setReason] = useState(''); const [saving, setSaving] = useState(false); const reviewToken = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousText = useRef('');
  useEffect(() => {
    let active = true;
    apiJson<Summary>('/admin/companies/summary').then(s => { if (active) setSummary(s); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const controller = new AbortController();
    const text = `${filters.q}|${filters.city}|${filters.hs}`;
    const delay = view === 'list' && previousText.current !== text && previousText.current !== '' ? 250 : 0;
    previousText.current = text;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams(view === 'list' ? filters : { status }); params.set('offset', String(offset));
        if (view === 'list') { const r = await apiJson<Paged<Company>>(`/admin/companies?${params}`, 'GET', undefined, controller.signal); if (active) setCompanies(r); }
        else { const r = await apiJson<Paged<Candidate>>(`/admin/companies/candidates?${params}`, 'GET', undefined, controller.signal); if (active) setCandidates(r); }
      } catch (e) { if (active) setError((e as Error).message); }
      finally { if (active) setLoading(false); }
    }, delay);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [filters, status, view, offset, revision]);
  useEffect(() => {
    if (!selected) return;
    let active = true; setDetail(null); setDetailLoading(true); setDetailError('');
    apiJson<Detail>(`/admin/companies/${encodeURIComponent(selected)}?offset=${factOffset}`).then(r => { if (active) setDetail(r); }).catch(e => { if (active) setDetailError(e.message); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected, factOffset, revision]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null; closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected('');
      if (e.key === 'Tab') { const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-company-dialog] button:not(:disabled),[data-company-dialog] summary,[data-company-dialog] a[href]')); const first = nodes[0]; const last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', onKey); const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = old; previous?.focus(); };
  }, [selected]);
  const change = (key: keyof typeof filters, value: string) => { setOffset(0); setFilters(f => ({ ...f, [key]: value })); };
  const open = (id: string) => { setFactOffset(0); setSelected(id); };
  const chooseReview = async (r: Candidate) => {
    const token = ++reviewToken.current; setReviewing(r); setReason(''); setHistory([]);
    try { const result = await apiJson<History[]>(`/admin/companies/reviews/${r.id}`); if (reviewToken.current === token) setHistory(result); }
    catch (e) { setError((e as Error).message); }
  };
  const act = async (action: string) => {
    if (!reviewing) return; setSaving(true); setError('');
    try { await apiJson(`/admin/companies/reviews/${reviewing.id}`, 'POST', { action, reason, revision: reviewing.revision }); setReviewing(null); setRevision(r => r + 1); }
    catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  return <section className="w-full min-w-0 space-y-5 p-3 sm:p-6 text-slate-200">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Kho doanh nghiệp</h1><p className="mt-1 max-w-3xl text-sm text-slate-400">Maps, Customs và danh bạ trong cùng kho. Hồ sơ chưa duyệt là hồ sơ tạm; địa điểm Maps và bằng chứng giao dịch được giữ riêng.</p></div><button className={button} onClick={() => setRevision(r => r + 1)}>Tải lại</button></div>
    {summary && <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Hồ sơ hiện có', summary.roots], ['Bản ghi nguồn', summary.facts], ['Cặp chờ duyệt', summary.pending], ['Liên kết đã duyệt', summary.linked]].map(([label, n]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-400">{label}</div><div className="mt-2 text-2xl font-semibold tabular-nums">{fmt(Number(n || 0))}</div></div>)}</div><p className="text-xs text-slate-400">Đồng bộ: {summary.lastSync ? STATUS[summary.lastSync.status] || summary.lastSync.status : 'Chưa chạy'} · {date(summary.lastSync?.finished_at)}. Bằng chứng cũ vẫn được giữ khi nguồn không còn bản ghi.</p></>}
    <div className="flex gap-2"><button className={`${button} ${view === 'list' ? 'bg-blue-600/30 border-blue-500' : ''}`} onClick={() => { setView('list'); setOffset(0); }}>Danh sách hồ sơ</button><button className={`${button} ${view === 'review' ? 'bg-blue-600/30 border-blue-500' : ''}`} onClick={() => { setView('review'); setOffset(0); }}>Duyệt liên kết</button></div>
    {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
    {view === 'list' ? <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <input className={field} aria-label="Tên doanh nghiệp" placeholder="Tên doanh nghiệp…" value={filters.q} onChange={e => change('q', e.target.value)} />
        <select className={field} aria-label="Quốc gia" value={filters.country} onChange={e => change('country', e.target.value)}><option value="">Tất cả quốc gia</option>{summary?.countries.map(c => <option key={c.country} value={c.country}>{c.country} ({fmt(c.n)})</option>)}</select>
        <input className={field} aria-label="Thành phố" placeholder="Thành phố…" value={filters.city} onChange={e => change('city', e.target.value)} />
        <select className={field} aria-label="Nguồn dữ liệu" value={filters.source} onChange={e => change('source', e.target.value)}><option value="">Tất cả nguồn</option>{Object.entries(SOURCE).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
        <select className={field} aria-label="Vai trò" value={filters.role} onChange={e => change('role', e.target.value)}><option value="">Tất cả vai trò</option>{Object.entries(ROLE).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
        <select className={field} aria-label="Thông tin liên hệ" value={filters.contact} onChange={e => change('contact', e.target.value)}><option value="">Thông tin liên hệ</option><option value="email">Có email</option><option value="phone">Có điện thoại</option><option value="website">Có website</option></select>
        <select className={field} aria-label="Sản phẩm" value={filters.product} onChange={e => change('product', e.target.value)}><option value="">Tất cả sản phẩm</option>{summary?.products.map(p => <option key={p.product} value={p.product}>{p.product}</option>)}</select>
        <input className={field} aria-label="Mã HS" placeholder="Mã HS…" value={filters.hs} onChange={e => change('hs', e.target.value)} />
        <select className={field} aria-label="Trạng thái liên kết" value={filters.linked} onChange={e => change('linked', e.target.value)}><option value="">Tất cả hồ sơ</option><option value="1">Có liên kết đã duyệt</option></select>
        <button className={button} onClick={() => { setFilters({ q: '', country: '', city: '', source: '', role: '', contact: '', product: '', hs: '', linked: '' }); setOffset(0); }}>Xóa bộ lọc</button>
      </div>
      {loading ? <p role="status" className="py-8 text-slate-400">Đang tải hồ sơ…</p> : <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-900 text-xs text-slate-400"><tr>{['Doanh nghiệp', 'Nước / Thành phố', 'Vai trò', 'Nguồn', 'Liên hệ', 'Trạng thái'].map(s => <th key={s} className="p-3">{s}</th>)}</tr></thead><tbody>{companies?.rows.map(c => <tr key={c.id} className="border-t border-slate-800 hover:bg-slate-900/70"><td className="p-3"><button className="max-w-sm text-left text-blue-300 hover:underline break-words" onClick={() => open(c.id)}>{c.name}</button></td><td className="p-3">{c.country || 'Chưa rõ'}{c.city && ` · ${c.city}`}</td><td className="p-3">{ROLE[c.role] || c.role}</td><td className="p-3">{(c.sources || c.source).split(',').map(s => SOURCE[s] || s).join(', ')}</td><td className="p-3">{(c.contacts || '').split(',').filter(k => k !== 'domain').join(', ') || '—'}</td><td className="p-3">{c.linked ? 'Đã liên kết' : c.confidence === 'low' ? 'Nguồn độ tin cậy thấp' : 'Hồ sơ tạm'}</td></tr>)}</tbody></table>{companies?.total === 0 && <p className="p-6 text-slate-400">Không có hồ sơ phù hợp.</p>}</div>}
      <Pager offset={offset} total={companies?.total || 0} onPage={setOffset} />
    </> : <>
      <div className="flex flex-wrap gap-3 items-center"><select aria-label="Trạng thái duyệt" className={field} value={status} onChange={e => { setStatus(e.target.value); setOffset(0); setReviewing(null); }}>{['pending', 'approved', 'rejected'].map(s => <option key={s} value={s}>{STATUS[s]}</option>)}</select><span className="text-sm text-slate-400">Trùng tên/quốc gia là ứng viên, chưa xác minh. Kiểm tra hai hồ sơ trước khi gộp.</span></div>
      {reviewing && <div className="rounded-xl border border-blue-800 bg-blue-950/20 p-4 space-y-3"><h2 className="font-semibold break-words">{reviewing.left_name} ↔ {reviewing.right_name}</h2><p className="text-sm text-slate-400">Chỉ gộp khi xác định cùng doanh nghiệp. Các địa điểm cùng thương hiệu có thể là chi nhánh hoặc pháp nhân khác.</p><textarea className={`${field} w-full`} aria-label="Lý do quyết định" placeholder="Căn cứ quyết định (bắt buộc)…" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /><div className="flex flex-wrap gap-2">{(reviewing.status === 'pending' ? [['approve', 'Gộp cùng doanh nghiệp'], ['reject', 'Giữ riêng / từ chối']] : [['undo', 'Hoàn tác quyết định']]).map(([action, label]) => <button key={action} className={button} disabled={saving || reason.trim().length < 3 || (action === 'approve' && !!reviewing.evidence_changed)} onClick={() => act(action)}>{saving ? 'Đang lưu…' : label}</button>)}<button className={button} disabled={saving} onClick={() => setReviewing(null)}>Đóng</button></div>{history.map((h, i) => <p key={i} className="text-xs text-slate-400 break-words">{date(h.at)} · Admin #{h.actor} · {h.action}: {h.reason}</p>)}</div>}
      {loading ? <p role="status">Đang tải ứng viên…</p> : <div className="space-y-2">{candidates?.rows.map(r => <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4"><div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap gap-x-3"><button className="text-left text-blue-300 hover:underline break-words" onClick={() => open(r.left_id)}>{r.left_name} ({SOURCE[r.left_source]})</button><span>↔</span><button className="text-left text-blue-300 hover:underline break-words" onClick={() => open(r.right_id)}>{r.right_name} ({SOURCE[r.right_source]})</button></div><p className="text-xs text-slate-400">{r.country} · Trùng tên, quốc gia{r.signals.includes('domain') ? ' và domain' : ''}{r.left_confidence === 'low' || r.right_confidence === 'low' ? ' · Có nguồn độ tin cậy thấp' : ''}{r.evidence_changed ? ' · Bằng chứng đã thay đổi' : ''}</p></div><button className={button} disabled={saving} onClick={() => chooseReview(r)}>Xem quyết định</button></div>)}{candidates?.total === 0 && <p className="py-6 text-slate-400">Chưa có cặp ở trạng thái này.</p>}</div>}
      <Pager offset={offset} total={candidates?.total || 0} onPage={setOffset} />
    </>}
    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={() => setSelected('')}><div data-company-dialog role="dialog" aria-modal="true" aria-label="Chi tiết doanh nghiệp" className="h-full w-full max-w-4xl overflow-y-auto border-l border-slate-700 bg-slate-950 p-4 sm:p-6 space-y-5" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold break-words">{detail?.company.name || 'Chi tiết doanh nghiệp'}</h2><button ref={closeRef} className={button} onClick={() => setSelected('')}>Đóng</button></div>{detailError && <p role="alert" className="text-red-300">{detailError}</p>}{detailLoading && <p role="status">Đang tải bằng chứng…</p>}{detail && <>
      <p className="text-sm text-slate-400">{detail.company.country || 'Chưa rõ quốc gia'} · {detail.profiles.length > 1 ? 'Có liên kết admin đã duyệt' : 'Hồ sơ tạm từ nguồn'}. Vận đơn lịch sử không xác nhận nhu cầu mua hiện tại.</p>
      <div><h3 className="font-semibold mb-2">Hồ sơ và địa điểm nguồn</h3>{detail.profiles.map(p => <div key={p.id} className="border-b border-slate-800 py-2 text-sm break-words">{p.name} · {SOURCE[p.source]} · {ROLE[p.role] || p.role} · {p.country || 'Chưa rõ nước'} {p.city}{p.confidence === 'low' && ' · Độ tin cậy thấp'}</div>)}</div>
      <div><h3 className="font-semibold mb-2">Liên hệ từ nguồn · chưa xác minh hoạt động</h3>{detail.contacts.length ? <div className="space-y-1 text-sm">{detail.contacts.filter(c => c.kind !== 'domain').map((c, i) => <p key={i} className="break-all"><span className="text-slate-500">{c.kind} · {SOURCE[c.source]}: </span>{c.value}</p>)}</div> : <p className="text-sm text-slate-500">Chưa có liên hệ.</p>}{detail.contacts.length >= 500 && <p className="text-xs text-amber-300">Hiển thị tối đa 500 liên hệ; xem thêm trong bằng chứng nguồn.</p>}</div>
      <div><h3 className="font-semibold mb-2">Bằng chứng theo nguồn</h3>{detail.totals.map((t, i) => <p key={i} className="text-sm text-slate-400">{SOURCE[t.source]} · {ROLE[t.role] || t.role}: {fmt(t.rows)} bản ghi nguồn {t.firstDate && `· ${t.firstDate} — ${t.lastDate}`}</p>)}<p className="mt-2 text-xs text-amber-300">Số dòng vận đơn và xếp hạng được tách riêng, chưa cộng thành tổng giao dịch hoặc USD. Sản phẩm suy ra giữ cờ product_inferred trong bằng chứng.</p></div>
      <div className="space-y-2">{detail.facts.map(f => <details key={f.id} className="rounded-lg border border-slate-800 p-3"><summary className="cursor-pointer text-sm break-words">{SOURCE[f.source]} · {ROLE[f.role] || f.role} · {f.trade_date || 'Không có ngày giao dịch'} {f.hs && `· HS ${f.hs}`} {f.product && `· ${f.product}`}</summary><p className="mt-2 text-xs text-slate-500">Cập nhật bản sao: {date(f.imported_at)}</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-400">{JSON.stringify(f.payload, null, 2)}</pre></details>)}</div>
      <Pager offset={factOffset} total={detail.total} onPage={setFactOffset} />
    </>}</div></div>}
  </section>;
}
