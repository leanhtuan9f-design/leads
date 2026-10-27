import { useEffect, useState } from 'react';
import { IconArrowRight as ArrowRight, IconCheck as Check, IconRefresh as RefreshCw } from '@tabler/icons-react';

import { planBenefits } from '../data/planFeatures';

type PlanKey = 'BASIC' | 'ADVANCED';
type Cycle = 'MONTHLY' | 'ANNUAL';
interface Catalog { plans: Record<PlanKey, { dailyNew: number; dailyRefresh: number; maxCountries: number; maxConcurrentSearches: number; dailySearches: number }>; prices?: Record<PlanKey, Record<Cycle, number>> }
export function LandingPricing() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cycle, setCycle] = useState<Cycle>('ANNUAL');
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
    <div className="export-pricing-heading"><p className="export-kicker">ĐẦU TƯ CHO THỊ TRƯỜNG TIẾP THEO</p><h2 id="pricing-title">Bắt đầu phù hợp.<br />Mở rộng khi bạn sẵn sàng.</h2><p>Trải nghiệm dữ liệu trước khi chọn gói cho đội ngũ của bạn.</p><div className="export-cycle" role="group" aria-label="Chu kỳ thanh toán"><button type="button" aria-pressed={cycle === 'MONTHLY'} onClick={() => setCycle('MONTHLY')}>Hàng tháng</button><button type="button" aria-pressed={cycle === 'ANNUAL'} onClick={() => setCycle('ANNUAL')}>Hàng năm <em className="export-cycle-badge">Khuyến khích</em></button></div></div>
    {status === 'error' ? <div className="export-catalog-error" role="status">Chưa tải được giá hiện hành. Bạn có thể xem gói trong ứng dụng.<button type="button" onClick={() => setAttempt(value => value+1)}><RefreshCw size={14} />Thử lại</button></div> : null}
    <div className="export-plan-grid"><article className="export-plan"><span className="export-plan-tag">KHÁM PHÁ SẢN PHẨM</span><h3>Dùng thử</h3><p>Đánh giá dữ liệu với ngành hàng của bạn.</p><div className="export-plan-price">Miễn phí<small>để bắt đầu</small></div><a className="export-button export-button-outline" href="/app">Trải nghiệm ngay <ArrowRight size={17}/></a><ul><li><Check size={17}/>Xem thông tin doanh nghiệp và liên hệ khi có</li><li><Check size={17}/>Tìm doanh nghiệp theo thị trường</li><li><Check size={17}/>Xem và lọc dữ liệu kết quả</li><li><Check size={17}/>Chưa cần thông tin thanh toán</li></ul></article>
      {(['BASIC','ADVANCED'] as const).map(key => {
        const featured = key === 'BASIC'; const plan = catalog?.plans[key]; const price = catalog?.prices?.[key]?.[cycle];
        return <article className={`export-plan ${featured ? 'export-plan-featured' : ''}`} key={key}><span className="export-plan-tag">{featured ? 'XÂY DỰNG DANH SÁCH' : 'MỞ RỘNG TÌM KIẾM'}</span><h3>{featured ? 'Basic' : 'Advanced'}</h3><p>{featured ? 'Cho nhu cầu tìm đối tác và tiếp cận đều đặn.' : 'Cho nhu cầu tìm kiếm ở nhiều thị trường.'}</p><div className="export-plan-price" aria-live="polite">{status === 'loading' ? <span className="export-price-placeholder">Đang tải giá…</span> : typeof price === 'number' && Number.isFinite(price) && price >= 0 ? <>{price.toLocaleString('vi-VN')}<span>₫</span><small>/{cycle === 'MONTHLY' ? 'tháng' : 'năm'}{featured ? ' · mỗi quốc gia' : ''}</small></> : <span className="export-price-placeholder">Xem giá trong ứng dụng</span>}</div><a className={`export-button ${featured ? '' : 'export-button-outline'}`} href={`/app?billing=1&plan=${key}&cycle=${cycle}`}>Xem gói {featured ? 'Basic' : 'Advanced'} <ArrowRight size={17}/></a><ul>{planBenefits(key, plan).map(feature => <li key={feature}><Check size={17}/>{feature}</li>)}</ul></article>;
      })}</div><p className="export-pricing-note">Email, điện thoại và website được cung cấp khi có dữ liệu. Xem thông tin thanh toán trong ứng dụng trước khi nâng cấp.</p>
  </div></section>;
}
