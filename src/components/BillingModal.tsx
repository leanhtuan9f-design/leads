import { planFeatures } from '../data/planFeatures';
import React, { useEffect, useState } from 'react';
import { Check, Copy, X, Crown, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { apiJson } from '../auth/types';
import { COUNTRIES } from '../data/countries';

type Props = { userEmail: string; trialId?: string; onClose: () => void; onActivated: () => void };
type Checkout = { orderId: string; session: { paymentSessionId: string; status: string; expiresAt?: string | null; instructions?: Record<string, unknown>; amount?: { value?: string; currency?: string } } };
type PlanKey = 'BASIC' | 'ADVANCED';
type Plan = { dailyNew: number; dailyRefresh: number; maxCountries?: number; maxConcurrentSearches?: number; dailySearches?: number };
type BillingConfig = { plans: Record<PlanKey, Plan>; prices?: Record<PlanKey, { MONTHLY: number; ANNUAL: number }>; features?: Record<PlanKey, string[]> };
type AccountPlan = { plan: { plan: PlanKey | 'TRIAL'; billingCycle: string | null; orderId?: string | null }; quota: { newLimit: number; refreshLimit: number; countries?: string[] }; plans: Record<PlanKey, Plan>; prices?: Record<PlanKey, { MONTHLY: number; ANNUAL: number }>; features?: Record<PlanKey, string[]> };

const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const fallbackPrices: Record<PlanKey, { MONTHLY: number; ANNUAL: number }> = {
  BASIC: { MONTHLY: 2000, ANNUAL: 4000 },
  ADVANCED: { MONTHLY: 4000, ANNUAL: 8000 },
};

export function BillingModal({ userEmail, trialId, onClose, onActivated }: Props) {
  const isExistingUser = !trialId;
  const [form, setForm] = useState({ name: '', email: userEmail.includes('@trial.local') ? '' : userEmail, phone: '', password: '', plan: new URLSearchParams(window.location.search).get('plan') === 'ADVANCED' ? 'ADVANCED' : 'BASIC', billingCycle: new URLSearchParams(window.location.search).get('cycle') === 'MONTHLY' ? 'MONTHLY' : 'ANNUAL' });
  const [countries, setCountries] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<BillingConfig | null>(null);
  const [accountPlan, setAccountPlan] = useState<AccountPlan | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);

  useEffect(() => {
    apiJson<AccountPlan>('/account/plan').then((current) => {
      setCatalog({ plans: current.plans, prices: current.prices, features: current.features });
      setAccountPlan(current);
      if (current.quota.countries?.length) setCountries(current.quota.countries); // đang dùng gói giới hạn nước: gợi ý sẵn các nước hiện có
      if (current.plan.plan === 'ADVANCED' && !new URLSearchParams(window.location.search).has('plan')) setForm(previous => ({ ...previous, plan: 'ADVANCED' }));
    }).catch(() => setCatalogError('Không tải được bảng gói dịch vụ. Bạn vẫn có thể chọn gói mặc định.'));
  }, []);

  useEffect(() => {
    if (!checkout?.session.paymentSessionId) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await apiJson<{ status: string }>(`/billing/orders/${encodeURIComponent(checkout.orderId)}/status`);
        if (result.status === 'PAID' || result.status === 'FULFILLED') {
          window.clearInterval(timer);
          // User đang đăng nhập đã có session hợp lệ; không login lại bằng mật khẩu rỗng.
          // Chỉ tài khoản trial mới cần đăng nhập sau khi CRM kích hoạt tài khoản mới.
          if (!isExistingUser) {
            try { await apiJson('/auth/login', 'POST', { email: form.email, password: form.password }); } catch { /* user can login manually */ }
          }
          onActivated();
        }
      } catch { /* CRM may be temporarily unavailable; keep polling */ }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [checkout, form.email, form.password, isExistingUser, onActivated]);

  const createCheckout = async (selectedPlan = form.plan, selectedCycle = form.billingCycle) => {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      // Backend cũ vẫn kiểm tra password ở checkout. Với tài khoản đã đăng nhập,
      // server mới bỏ qua giá trị này và dùng tài khoản hiện tại; giá trị dự phòng
      // giúp checkout không lỗi khi frontend gặp server chưa reload bản mới.
      const checkoutPassword = isExistingUser ? 'ExistingAccountPayment1!' : form.password;
      const result = await apiJson<Checkout>('/billing/checkout', 'POST', { ...form, password: checkoutPassword, plan: selectedPlan, billingCycle: selectedCycle, trialId, countries: needsCountry(selectedPlan as PlanKey) ? countries : undefined });
      setCheckout(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'Không tạo được đơn thanh toán'); }
    finally { setBusy(false); }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    await createCheckout();
  };

  const instructions = checkout?.session.instructions || {};
  const rawAmount = checkout?.session.amount?.value || str(instructions.amount);
  const amountNumber = Number(rawAmount);
  const currencyCode = (checkout?.session.amount?.currency || str(instructions.currency) || 'VND').toUpperCase();
  const amount = rawAmount && Number.isFinite(amountNumber)
    ? currencyCode === 'VND' ? `${Math.round(amountNumber).toLocaleString('vi-VN')} ₫` : `${amountNumber.toLocaleString('vi-VN')} ${currencyCode}`
    : rawAmount;
  const bank = (instructions.bank && typeof instructions.bank === 'object' ? instructions.bank : {}) as Record<string, unknown>;
  const account = str(bank.accountNumber || instructions.bankAccountNumber || instructions.accountNumber);
  const bankLabel = [str(bank.bankName), str(bank.accountName)].filter(Boolean).join(' - ');
  const note = str(instructions.transferNote || instructions.orderCode) || checkout?.orderId || '';
  const qr = str(instructions.qrImageUrl);
  // A non-trial session must never be presented as a trial while the plan
  // request is stale or an older API response still says TRIAL.
  const inferredPlan = (accountPlan?.quota?.newLimit || 0) >= 2000 ? 'ADVANCED' : (accountPlan?.quota?.newLimit || 0) >= 500 ? 'BASIC' : 'TRIAL';
  const currentPlan = accountPlan?.plan?.plan && accountPlan.plan.plan !== 'TRIAL'
    ? accountPlan.plan.plan
    : (isExistingUser ? inferredPlan : 'TRIAL');
  // Gói giới hạn số quốc gia (Basic): người mua chọn các nước ngay lúc thanh toán, giá = giá gói × số nước (CRM nhân theo quantity).
  const needsCountry = (plan: PlanKey) => (catalog?.plans?.[plan]?.maxCountries ?? (plan === 'BASIC' ? 1 : 0)) > 0;
  const selectPlan = (plan: PlanKey, billingCycle: 'MONTHLY' | 'ANNUAL') => setForm(previous => ({ ...previous, plan, billingCycle }));
  const planLabel = (plan: string) => plan === 'ADVANCED' ? 'Advanced' : plan === 'BASIC' ? 'Basic' : 'Dùng thử';
  const priceFor = (plan: PlanKey, cycle: 'MONTHLY' | 'ANNUAL') => (catalog?.prices?.[plan]?.[cycle] ?? fallbackPrices[plan][cycle]) * (needsCountry(plan) ? Math.max(1, countries.length) : 1);
  const unitPriceFor = (plan: PlanKey, cycle: 'MONTHLY' | 'ANNUAL') => catalog?.prices?.[plan]?.[cycle] ?? fallbackPrices[plan][cycle];
  const toggleCountry = (name: string) => setCountries(previous => previous.includes(name) ? previous.filter(item => item !== name) : [...previous, name]);
  const formatPrice = (value?: number) => typeof value === 'number' ? `${value.toLocaleString('vi-VN')} ₫` : '—';

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
    <section role="dialog" aria-modal="true" className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-slate-950 p-5 text-slate-100 shadow-2xl sm:rounded-2xl sm:p-6">
      <header className="flex items-center justify-between"><div><h2 className="text-xl font-bold text-white">Nâng cấp gói dịch vụ</h2>{!checkout && !showCheckoutForm && <p className="mt-1 text-sm text-slate-400">Chọn gói dữ liệu phù hợp với nhu cầu tìm khách hàng.</p>}</div><button onClick={onClose} aria-label="Đóng"><X className="h-5 w-5" /></button></header>
      {!checkout && (!showCheckoutForm || isExistingUser) ? <div className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-lg border border-slate-800 bg-slate-900 p-1"><button type="button" onClick={() => setForm(previous => ({ ...previous, billingCycle: 'MONTHLY' }))} className={`rounded-md px-4 py-2 text-sm font-semibold ${form.billingCycle === 'MONTHLY' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Thanh toán tháng</button><button type="button" onClick={() => setForm(previous => ({ ...previous, billingCycle: 'ANNUAL' }))} className={`rounded-md px-4 py-2 text-sm font-semibold ${form.billingCycle === 'ANNUAL' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Thanh toán năm<span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">Khuyến khích</span></button></div>{currentPlan && <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1.5 text-xs text-blue-300"><Crown className="h-3.5 w-3.5" /> Đang dùng: {planLabel(currentPlan)}</span>}</div>
        {catalogError && <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">{catalogError}</div>}
        {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          {(['BASIC', 'ADVANCED'] as PlanKey[]).map(plan => {
            const details = catalog?.plans?.[plan];
            const isCurrent = currentPlan === plan;
            const selectedCycle = form.billingCycle as 'MONTHLY' | 'ANNUAL';
            const isCurrentBasic = isCurrent && plan === 'BASIC' && accountPlan?.plan?.billingCycle === selectedCycle;
            const isSelected = form.plan === plan;
            const price = priceFor(plan, form.billingCycle as 'MONTHLY' | 'ANNUAL');
            return <article key={plan} className={`relative flex flex-col rounded-2xl border p-5 transition ${plan === 'ADVANCED' ? 'border-blue-500/70 bg-gradient-to-b from-blue-950/70 to-slate-900' : 'border-slate-700 bg-slate-900/70'} ${isSelected ? 'ring-2 ring-blue-400' : ''}`}>
              {plan === 'ADVANCED' && <span className="absolute -top-3 left-5 rounded-full bg-blue-500 px-3 py-1 text-[11px] font-bold text-white">ĐƯỢC CHỌN NHIỀU NHẤT</span>}
              <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-white">{planLabel(plan)}</h3><p className="mt-1 text-xs text-slate-400">{plan === 'ADVANCED' ? 'Cho nhu cầu tìm kiếm ở nhiều thị trường' : 'Xây dựng danh sách khách hàng để tiếp cận'}</p></div>{isCurrent && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300">GÓI HIỆN TẠI</span>}</div>
              <div className="mt-4 flex items-end gap-2"><strong className="text-3xl font-black tracking-tight text-white">{formatPrice(price)}</strong><span className="pb-1 text-xs text-slate-400">/{form.billingCycle === 'ANNUAL' ? 'năm' : 'tháng'}</span></div>
              <div className="mt-4 rounded-lg bg-slate-950/60 p-2.5"><div className="text-[10px] uppercase text-slate-500">Cập nhật dữ liệu</div><div className="mt-1 font-mono text-sm font-bold text-white">{details ? details.dailyRefresh.toLocaleString('vi-VN') : '—'} <span className="text-[10px] font-normal text-slate-400">lượt/ngày</span></div></div>
              <ul className="mt-4 flex-1 space-y-2 border-t border-white/10 pt-4">{planFeatures[plan].map((feature, index) => <li key={`${plan}-${index}`} className="flex gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{feature}</li>)}</ul>
              {needsCountry(plan) && <fieldset className="mt-4 text-xs text-slate-400"><legend>Chọn quốc gia sử dụng <span className="text-slate-500">(giá tính theo từng quốc gia, khoá sau khi thanh toán)</span></legend>
                <div className="mt-2 grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2">{COUNTRIES.map(name => <label key={name} className="flex cursor-pointer items-center gap-1.5 text-slate-300"><input type="checkbox" checked={countries.includes(name)} onChange={() => toggleCountry(name)} />{name}</label>)}</div>
                <p className="mt-1.5 text-slate-300">{countries.length ? <>{countries.length} quốc gia × {formatPrice(unitPriceFor(plan, form.billingCycle as 'MONTHLY' | 'ANNUAL'))} = <strong className="text-white">{formatPrice(price)}</strong></> : 'Chọn ít nhất 1 quốc gia'}</p></fieldset>}
              <button type="button" disabled={busy || (needsCountry(plan) && countries.length === 0)} onClick={() => { const cycle = form.billingCycle as 'MONTHLY' | 'ANNUAL'; selectPlan(plan, cycle); if (isExistingUser) void createCheckout(plan, cycle); else setShowCheckoutForm(true); }} className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${plan === 'ADVANCED' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>{isCurrentBasic ? 'Mua lại / thêm quốc gia' : isExistingUser ? 'Thanh toán ngay bằng QR' : (isCurrent ? 'Gia hạn / đổi chu kỳ' : 'Chọn gói này')} <ArrowUpRight className="ml-1 inline h-4 w-4" /></button>
            </article>;
          })}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Thông tin liên hệ được cung cấp khi có dữ liệu. Bạn sẽ xem thông tin thanh toán trước khi xác nhận.</p>
      </div> : !checkout ? <form onSubmit={create} className="mx-auto mt-5 max-w-xl space-y-3"><button type="button" onClick={() => setShowCheckoutForm(false)} className="text-sm text-slate-400 hover:text-white">← Quay lại chọn gói</button><div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4"><div className="text-xs text-blue-300">Gói đã chọn</div><div className="mt-1 flex items-center justify-between"><strong className="text-lg text-white">{planLabel(form.plan)} · {form.billingCycle === 'ANNUAL' ? 'Hàng năm' : 'Hàng tháng'}{needsCountry(form.plan as PlanKey) && countries.length ? ` · ${countries.length} quốc gia` : ''}</strong><strong className="text-lg text-amber-300">{formatPrice(priceFor(form.plan as PlanKey, form.billingCycle as 'MONTHLY' | 'ANNUAL'))}</strong></div></div>{isExistingUser ? <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300">Thanh toán cho tài khoản <strong className="text-white">{userEmail}</strong>. Hệ thống sẽ tự cập nhật gói sau khi nhận được thanh toán.</div> : <><input required placeholder="Họ và tên" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5" /><input required type="email" placeholder="Email nhận tài khoản" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5" /><input required minLength={10} type="password" placeholder="Mật khẩu đăng nhập (từ 10 ký tự)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5" /></>}<input required pattern="^0\d{9,10}$" placeholder="Số điện thoại" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5" />{error && <div className="text-sm text-red-300">{error}</div>}<button type="submit" disabled={busy} aria-busy={busy} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-bold hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">{busy ? 'Đang tạo đơn, vui lòng chờ…' : 'Tiếp tục thanh toán'}</button></form> : <div className="mt-5 space-y-4"><div className="rounded-lg bg-amber-950/50 p-3 text-sm text-amber-200">Đang chờ Central CRM xác nhận tiền vào. Cửa sổ sẽ tự cập nhật.</div>{qr && <img src={qr} alt="Mã QR thanh toán" className="mx-auto max-h-64 rounded-lg bg-white p-2" />}<div className="space-y-2 rounded-lg border border-slate-700 p-3 text-sm"><div>Số tiền: <strong>{amount || 'theo thông tin CRM'}</strong></div>{bankLabel && <div className="flex justify-between gap-2">Ngân hàng: <strong>{bankLabel}</strong></div>}{account && <div className="flex justify-between gap-2">Tài khoản: <strong>{account}</strong><button onClick={() => { void navigator.clipboard?.writeText(account); setCopied(true); }} aria-label="Sao chép số tài khoản"><Copy className="h-4 w-4" /></button></div>}<div className="flex justify-between gap-2">Nội dung: <strong>{note}</strong><button onClick={() => { void navigator.clipboard?.writeText(note); setCopied(true); }} aria-label="Sao chép nội dung"><Copy className="h-4 w-4" /></button></div></div>{copied && <div className="text-center text-xs text-emerald-300"><Check className="mr-1 inline h-3.5 w-3.5" />Đã sao chép</div>}</div>}
    </section>
  </div>;
}
