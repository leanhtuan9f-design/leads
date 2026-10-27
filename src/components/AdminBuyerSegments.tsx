import { useEffect, useState } from 'react';
import { apiJson } from '../auth/types';

type Segments = { total: number; generatedAt: number; segments: { id: string; name: string; description: string; count: number }[] };
export function AdminBuyerSegments() {
  const [data, setData] = useState<Segments | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let busy = false;
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const result = await apiJson<Segments>('/admin/cache/segments');
        if (active) { setData(result); setError(''); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Không tải được phân tệp'); }
      finally { busy = false; }
    };
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => { active = false; clearInterval(interval); };
  }, [attempt]);
  return <section className="rounded-lg border border-slate-800 bg-slate-950 p-4" aria-labelledby="admin-segments-title">
    <h3 id="admin-segments-title" className="font-semibold text-white">Phân tệp theo dấu hiệu trong hồ sơ</h3>
    <p className="mt-2 text-[11px] text-slate-400">Dành cho admin rà soát và xử lý sau. Phân loại sơ bộ theo ngành chính/phụ; chưa xác minh hoạt động nhập khẩu, sản phẩm phù hợp hoặc nhu cầu mua. Không hiển thị trên homepage.</p>
    {error ? <p className="mt-3 text-amber-300" role="status">{error} <button type="button" onClick={() => setAttempt(v => v + 1)} className="underline">Thử lại</button></p> : !data ? <p className="mt-3 text-slate-400" role="status">Đang tải phân tệp…</p> : null}
    {data && <><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.segments.map(segment => <article key={segment.id} className="rounded border border-slate-800 bg-slate-900 p-3"><strong className="font-mono text-xl text-white">{segment.count.toLocaleString('vi-VN')}</strong><h4 className="mt-1 font-semibold text-slate-200">{segment.name}</h4><p className="mt-2 text-[11px] text-slate-400">{segment.description}</p></article>)}</div><p className="mt-3 text-[11px] text-slate-500">Tổng {data.total.toLocaleString('vi-VN')} hồ sơ · Tự làm mới mỗi 30 giây. Đây là thống kê rà soát, chưa có thao tác duyệt hoặc sửa phân loại.</p></>}
  </section>;
}
