import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../auth/types';

interface Plan {
  enabled: boolean; round: number; filled: boolean; cycles: number; keywords: number; cities: number;
  burstN: number; restMin: number; restMax: number; note: string;
  products: number; rounds: number; items: number; totalPairs: number;
  current: { round: number; tasks: number; running: number }; restUntil: number; aiEnabled: boolean;
}

export const AutoPlan: React.FC = () => {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<{ keywords: string; cities: string; burstN: string; restMin: string; restMax: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await apiJson<Plan>('/admin/auto-plan');
      setPlan(p);
      setForm(f => f ?? { keywords: String(p.keywords), cities: String(p.cities), burstN: String(p.burstN), restMin: String(p.restMin), restMax: String(p.restMax) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải lịch xoay vòng');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  const save = async (enabled?: boolean) => {
    if (!form) return;
    setBusy(true); setError('');
    try {
      await apiJson('/admin/auto-plan', 'PUT', { ...form, ...(enabled === undefined ? {} : { enabled }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center text-white';
  const set = (k: keyof NonNullable<typeof form>) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <section className="bg-slate-950 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-semibold text-white">Lịch xoay vòng theo dữ liệu xuất khẩu</h3>
        {plan && (
          <button onClick={() => save(!plan.enabled)} disabled={busy || !form || !plan.aiEnabled}
            className={`py-1.5 px-4 rounded-lg font-semibold text-white disabled:bg-slate-800 disabled:text-slate-500 ${plan.enabled ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            {plan.enabled ? 'Tắt lịch' : 'Bật lịch'}
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        Mỗi vòng, mỗi mặt hàng (số liệu GSO mới nhất) chỉ được tìm lead ở MỘT nước nhập khẩu: vòng 1 là nước kim ngạch cao nhất, vòng 2 là nước thứ hai… Mỗi nước chỉ cào vài từ khóa × vài thành phố lớn.
        Vòng sau chỉ bắt đầu khi vòng trước xong. Nguồn GSO chỉ công bố tối đa 5 nước/mặt hàng. Bỏ qua dầu thô, xăng dầu, than, quặng, xi măng. Các tác vụ thủ công bên dưới vẫn chạy bình thường.
      </p>
      {plan && form && (
        <>
          <div className="text-xs text-slate-300 mb-2">
            {plan.enabled ? <span className="text-emerald-300">Đang bật</span> : <span className="text-slate-400">Đang tắt</span>}
            {' · '}{plan.products} mặt hàng · {plan.items} cặp mặt hàng×nước · tối đa {plan.rounds} vòng · khoảng {plan.totalPairs} cặp cào/chu kỳ · đã xong {plan.cycles} chu kỳ
            {plan.enabled && <> · vòng {plan.current.round}: {plan.current.running}/{plan.current.tasks} tác vụ đang chạy</>}
            {plan.restUntil > Date.now() && <> · ☕ nghỉ chung đến {new Date(plan.restUntil).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</>}
          </div>
          {plan.note && <div className="text-[11px] text-amber-300 mb-2">{plan.note}</div>}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <span>Từ khóa/nước</span><input type="number" min={1} max={6} value={form.keywords} onChange={set('keywords')} className={inputCls} />
            <span>Thành phố/nước</span><input type="number" min={1} max={10} value={form.cities} onChange={set('cities')} className={inputCls} />
            <span>Nghỉ chung: sau</span><input type="number" min={0} max={100} value={form.burstN} onChange={set('burstN')} className={inputCls} />
            <span>cặp, nghỉ</span><input type="number" min={0} max={240} value={form.restMin} onChange={set('restMin')} className={inputCls} />
            <span>–</span><input type="number" min={0} max={240} value={form.restMax} onChange={set('restMax')} className={inputCls} />
            <span>phút</span>
            <button onClick={() => save()} disabled={busy} className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg">Lưu</button>
          </div>
          {!plan.aiEnabled && <div className="text-amber-300 text-[11px] mt-2">AI chưa được cấu hình (menu tài khoản → Cấu hình AI) nên không thể bật lịch.</div>}
        </>
      )}
      {error && <div className="text-red-300 text-xs mt-2">{error}</div>}
    </section>
  );
};
