import { useEffect, useState } from 'react';
import { ArrowRight, Check, RefreshCw } from 'lucide-react';

type PlanKey = 'BASIC' | 'ADVANCED';
type Cycle = 'MONTHLY' | 'ANNUAL';
interface Catalog { plans: Record<PlanKey, { dailyNew: number; dailyRefresh: number }>; prices?: Record<PlanKey, Record<Cycle, number>> }
export function LandingPricing() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cycle, setCycle] = useState<Cycle>('MONTHLY');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetch('/api/billing/config', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Catalog unavailable');
      const value: Catalog = await response.json();
      if (!value.plans?.BASIC || !value.plans?.ADVANCED) throw new Error('Invalid catalog');
      setCatalog(value); setStatus('ready');
    }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [attempt]);
  return <section className="export-section export-pricing" id="bang-gia" aria-labelledby="pricing-title"><div className="export-container">
    <div className="export-pricing-heading"><p className="export-kicker">ĐẦU TƯ CHO THỊ TRƯỜNG TIẾP THEO</p><h2 id="pricing-title">Bắt đầu phù hợp.<br />Mở rộng khi bạn sẵn sàng.</h2><p>Trải nghiệm dữ liệu trước khi chọn gói cho đội ngũ của bạn.</p><div className="export-cycle" role="group" aria-label="Chu kỳ thanh toán"><button type="button" aria-pressed={cycle === 'MONTHLY'} onClick={() => setCycle('MONTHLY')}>Hàng tháng</button><button type="button" aria-pressed={cycle === 'ANNUAL'} onClick={() => setCycle('ANNUAL')}>Hàng năm</button></div></div>
    {status === 'error' ? <div className="export-catalog-error" role="status">Chưa tải được giá hiện hành. Bạn có thể xem gói trong ứng dụng.<button type="button" onClick={() => setAttempt(value => value+1)}><RefreshCw size={14} />Thử lại</button></div> : null}
    <div className="export-plan-grid"><article className="export-plan"><span className="export-plan-tag">KHÁM PHÁ SẢN PHẨM</span><h3>Dùng thử</h3><p>Đánh giá dữ liệu với ngành hàng của bạn.</p><div className="export-plan-price">Miễn phí<small>để bắt đầu</small></div><a className="export-button export-button-outline" href="/app">Trải nghiệm ngay <ArrowRight size={17}/></a><ul><li><Check size={17}/>Phiên dùng thử với hạn mức riêng</li><li><Check size={17}/>Tìm doanh nghiệp theo thị trường</li><li><Check size={17}/>Xem và lọc dữ liệu kết quả</li><li><Check size={17}/>Chưa cần thông tin thanh toán</li></ul></article>
      {(['BASIC','ADVANCED'] as const).map(key => {
        const featured = key === 'BASIC'; const plan = catalog?.plans[key]; const price = catalog?.prices?.[key]?.[cycle];
        return <article className={`export-plan ${featured ? 'export-plan-featured' : ''}`} key={key}><span className="export-plan-tag">{featured ? 'XÂY DỰNG DANH SÁCH' : 'MỞ RỘNG TÌM KIẾM'}</span><h3>{featured ? 'Basic' : 'Advanced'}</h3><p>{featured ? 'Cho nhu cầu tìm đối tác và tiếp cận đều đặn.' : 'Cho nhu cầu tìm kiếm ở nhiều thị trường.'}</p><div className="export-plan-price" aria-live="polite">{status === 'loading' ? <span className="export-price-placeholder">Đang tải giá…</span> : typeof price === 'number' && Number.isFinite(price) && price >= 0 ? <>{price.toLocaleString('vi-VN')}<span>₫</span><small>/{cycle === 'MONTHLY' ? 'tháng' : 'năm'}</small></> : <span className="export-price-placeholder">Xem giá trong ứng dụng</span>}</div><a className={`export-button ${featured ? '' : 'export-button-outline'}`} href={`/app?billing=1&plan=${key}&cycle=${cycle}`}>Xem gói {featured ? 'Basic' : 'Advanced'} <ArrowRight size={17}/></a><ul><li><Check size={17}/>{plan ? `${plan.dailyNew.toLocaleString('vi-VN')} địa điểm mới/ngày` : 'Hạn mức địa điểm theo gói'}</li><li><Check size={17}/>{plan ? `${plan.dailyRefresh.toLocaleString('vi-VN')} lượt làm mới/ngày` : 'Lượt làm mới theo gói'}</li><li><Check size={17}/>Lọc, lưu và xuất danh sách CSV</li><li><Check size={17}/>Thông tin liên hệ công khai khi có</li></ul></article>;
      })}</div><p className="export-pricing-note">Giá lấy từ cấu hình hiện hành. Xem hạn mức và thông tin thanh toán trong ứng dụng trước khi nâng cấp.</p>
  </div></section>;
}
