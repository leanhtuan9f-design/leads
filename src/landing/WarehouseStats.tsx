import { useEffect, useState } from 'react';
import { IconBuildingSkyscraper, IconWorld, IconChartBar } from '@tabler/icons-react';

type Entry = { name: string; count: number; hsCode?: string };
type Stats = { total: number; lastUpdatedAt: number | null; generatedAt: number; countries: Entry[]; products: Entry[] };
const number = (value: number) => value.toLocaleString('vi-VN');
const countryNames = new Intl.DisplayNames(['vi'], { type: 'region' });
function countryLabel(name: string) {
  if (!/^[A-Za-z]{2}$/.test(name)) return name;
  return countryNames.of(name.toUpperCase()) || name;
}

export function WarehouseStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const response = await fetch('/api/public/warehouse-stats', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Statistics unavailable');
        const data: Stats = await response.json();
        if (!Number.isFinite(data.total) || !Array.isArray(data.countries) || !Array.isArray(data.products)) throw new Error('Invalid statistics');
        if (!controller.signal.aborted) { setStats(data); setFailed(false); }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally { busy = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [attempt]);

  const ranking = (title: string, entries: Entry[], countries: boolean) => <article className="export-stock-card">
    <h3>{countries ? <IconWorld size={23}/> : <IconChartBar size={23}/>} {title}</h3>
    <p className="export-stock-caption">{countries ? 'Theo số hồ sơ trong kho, chưa xác minh vai trò nhập khẩu' : 'Hồ sơ thu thập theo nhóm sản phẩm và mã HS'}</p>
    {entries.length ? <ol>{entries.map((entry, index) => <li key={entry.name}>
      <span className="export-stock-rank">{index + 1}</span>
      <a className="export-stock-label export-stock-link" href={`/companies/?${new URLSearchParams(countries ? { country: entry.name } : entry.hsCode ? { hs: entry.hsCode } : { product: entry.name })}`}>{countries ? countryLabel(entry.name) : entry.name}{!countries && entry.hsCode ? <small className="export-stock-hs">HS {entry.hsCode}</small> : null}<span className="export-stock-track" aria-hidden="true"><span style={{ width: `${entry.count / entries[0].count * 100}%` }}/></span></a>
      <strong>{number(entry.count)}<small>doanh nghiệp</small></strong>
    </li>)}</ol> : <p className="export-stock-empty">Chưa có dữ liệu {countries ? 'quốc gia' : 'sản phẩm'} để thống kê.</p>}
  </article>;

  return <section id="du-lieu" className="export-section export-container export-stock" aria-labelledby="stock-title">
    <div className="export-stock-heading"><div><p className="export-kicker">DỮ LIỆU HIỆN CÓ</p><h2 id="stock-title">Khám phá doanh nghiệp nhập khẩu tiềm năng.</h2><p>Top quốc gia và nhóm sản phẩm có nhiều hồ sơ trong kho, cập nhật tự động từ dữ liệu hiện có.</p></div>
      {stats && <div className="export-stock-total"><IconBuildingSkyscraper size={25}/><strong>{number(stats.total)}</strong><span>hồ sơ doanh nghiệp trong kho</span></div>}
    </div>
    {failed ? <div className="export-stock-status" role="status">{stats ? 'Tạm thời chưa làm mới được. Đang hiển thị số liệu lần tải gần nhất.' : 'Chưa tải được thống kê dữ liệu.'} <button type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button></div> : !stats ? <p className="export-stock-status" role="status">Đang tải thống kê từ kho dữ liệu…</p> : null}
    {stats && <><div className="export-stock-grid">{ranking('Top 5 quốc gia', stats.countries, true)}{ranking('Top 5 nhóm sản phẩm', stats.products, false)}</div>
      <p className="export-stock-note">{stats.lastUpdatedAt ? <>Dữ liệu cập nhật: <time dateTime={new Date(stats.lastUpdatedAt).toISOString()}>{new Date(stats.lastUpdatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</time> (giờ Việt Nam). </> : ''}Tự làm mới mỗi 30 giây. Nhóm sản phẩm dựa trên mã HS của lượt thu thập; mỗi hồ sơ chỉ tính một lần trong mỗi nhóm và có thể thuộc nhiều nhóm. Hồ sơ chưa gắn HS chưa tính vào bảng sản phẩm.</p></>}
  </section>;
}
