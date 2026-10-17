import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../auth/types';

interface Plan {
  enabled: boolean; round: number; filled: boolean; cycles: number; keywords: number; cities: number;
  burstN: number; restMin: number; restMax: number; note: string;
  products: number; rounds: number; items: number; totalPairs: number;
  current: { round: number; tasks: number; running: number }; restUntil: number; aiEnabled: boolean;
  hasProxy: boolean; keyCount: number;
  keyStatus: { id: string; ok: boolean; hostPort: string; expiresAt: number; carrier: string; location: string; error: string; retryAt: number }[];
  threads: { running: number; min: number; max: number; allowed: boolean; mem: number; load: number };
}

interface ProxyTest {
  connected: boolean; mapsOk: boolean; ips: { ip: string; ms: number }[]; distinct: number; rotating: boolean; avgMs: number | null;
  maps: { status: number; ms: number; blocked: boolean; error: string }; error: string; serverIp: string; hint: string;
}

export const AutoPlan: React.FC = () => {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<{ keywords: string; cities: string; burstN: string; restMin: string; restMax: string } | null>(null);
  const [proxy, setProxy] = useState('');
  const [test, setTest] = useState<ProxyTest | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState('');
  const [keysText, setKeysText] = useState('');
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

  const testProxy = async () => {
    setTesting(true); setTest(null); setError('');
    try {
      setTest(await apiJson<ProxyTest>('/admin/auto-plan/test-proxy', 'POST', { proxy: proxy.trim() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thử được proxy');
    } finally {
      setTesting(false);
    }
  };

  const save = async (enabled?: boolean) => {
    if (!form) return;
    setBusy(true); setError('');
    try {
      await apiJson('/admin/auto-plan', 'PUT', { ...form, ...(proxy.trim() ? { proxy: proxy.trim() } : {}), ...(enabled === undefined ? {} : { enabled }) });
      setProxy('');
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
          <div className="mt-2 space-y-1 text-[11px] text-slate-300">
            <div className="flex flex-wrap items-start gap-2">
              <span className="pt-1">Key proxy xoay (proxy.vn)</span>
              <textarea value={keysText} onChange={e => setKeysText(e.target.value)} rows={2} spellCheck={false} autoComplete="off"
                placeholder={plan.keyCount ? `Đã lưu ${plan.keyCount} Key — nhập danh sách mới (mỗi dòng một Key) để thay` : 'Mỗi dòng một Key (tối đa 6)'}
                className="flex-1 min-w-[16rem] bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-white placeholder-slate-500" />
              <div className="flex flex-col gap-1">
                <button onClick={async () => { setBusy(true); setError(''); try { await apiJson('/admin/auto-plan', 'PUT', { keys: keysText }); setKeysText(''); setSaved('Đã lưu Key và lấy proxy'); setTimeout(() => setSaved(''), 4000); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được Key'); } finally { setBusy(false); } }}
                  disabled={busy || !keysText.trim()} className="py-1 px-3 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg">Lưu Key & lấy proxy</button>
                {plan.keyCount > 0 && (
                  <>
                    <button onClick={async () => { setBusy(true); setError(''); try { await apiJson('/admin/auto-plan/refresh-keys', 'POST', {}); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Không lấy được proxy mới'); } finally { setBusy(false); } }}
                      disabled={busy} className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg">Lấy proxy mới</button>
                    <button onClick={async () => { setBusy(true); try { await apiJson('/admin/auto-plan', 'PUT', { keys: '' }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Không xóa được'); } finally { setBusy(false); } }}
                      disabled={busy} className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg">Xóa Key</button>
                  </>
                )}
              </div>
            </div>
            {plan.keyStatus.map(k => (
              <div key={k.id} className={k.ok ? 'text-emerald-300' : 'text-amber-300'}>
                Key {k.id}: {!k.ok && k.error && k.retryAt > Date.now() ? `⏳ ${k.error} — tự thử lại sau ${Math.max(1, Math.round((k.retryAt - Date.now()) / 1000))} giây` : k.ok
                  ? `✅ ${k.hostPort}${k.carrier ? ` · ${k.carrier}` : ''}${k.location ? ` · ${k.location}` : ''} · còn ${Math.max(0, Math.round((k.expiresAt - Date.now()) / 60000))} phút (tự lấy proxy mới trước khi hết hạn)`
                  : `❌ ${k.error || 'đang lấy proxy…'}`}
              </div>
            ))}
            <div className="text-slate-500">Máy chủ tự gọi API của nhà cung cấp và tự cho phép IP máy chủ (whitelist). Có Key thì dùng proxy từ Key, bỏ qua ô proxy cố định bên dưới. Mỗi Key chỉ có một IP tại một thời điểm (đổi khoảng 30 phút/lần): muốn nhiều IP cho nhiều luồng thì dùng nhiều Key.</div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <span>Proxy xoay IP</span>
            <input value={proxy} onChange={e => setProxy(e.target.value)} type="password" autoComplete="off" spellCheck={false}
              placeholder={plan.hasProxy ? 'Đã cài proxy — nhập mới để thay' : 'host:port  |  host:port:user:pass  |  http://user:pass@host:port'}
              className="flex-1 min-w-[16rem] bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-white placeholder-slate-500" />
            <button onClick={async () => { setBusy(true); setError(''); try { await apiJson('/admin/auto-plan', 'PUT', { proxy: proxy.trim() }); setProxy(''); setTest(null); setSaved('Đã lưu proxy'); setTimeout(() => setSaved(''), 4000); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được proxy'); } finally { setBusy(false); } }}
              disabled={busy || !proxy.trim()} className="py-1 px-3 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg">Lưu proxy</button>
            <button onClick={testProxy} disabled={testing || (!proxy.trim() && !plan.hasProxy)}
              className="py-1 px-3 bg-blue-700 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg">
              {testing ? 'Đang thử…' : proxy.trim() ? 'Thử proxy trong ô' : 'Thử proxy đã lưu'}
            </button>
            {plan.hasProxy && (
              <button onClick={async () => { setBusy(true); try { await apiJson('/admin/auto-plan', 'PUT', { proxy: '' }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Không xóa được'); } finally { setBusy(false); } }}
                disabled={busy} className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg">Xóa proxy</button>
            )}
          </div>
          {saved && <div className="mt-1 text-[11px] text-emerald-300">✅ {saved}</div>}
          {test && (
            <div className={`mt-2 text-[11px] rounded border p-2 ${test.connected && test.mapsOk ? 'border-emerald-700 text-emerald-300' : 'border-amber-700 text-amber-300'}`}>
              <div>{test.connected ? `✅ Kết nối thành công (${test.ips.length}/3 lần, trung bình ${test.avgMs} ms)` : `❌ Không kết nối được: ${test.error}`}</div>
              {!test.connected && test.hint && <div className="mt-1">💡 {test.hint}</div>}
              {!test.connected && test.serverIp && (
                <div className="mt-1 flex items-center gap-2">IP máy chủ cần whitelist: <code className="font-mono text-white">{test.serverIp}</code>
                  <button onClick={() => { try { void navigator.clipboard.writeText(test.serverIp); } catch { /* bỏ qua */ } }} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-white rounded">Sao chép</button>
                </div>
              )}
              {test.connected && <div>IP nhận được: {test.ips.map(x => x.ip).join(', ')} — {test.rotating ? `✅ IP đổi giữa các lần (${test.distinct} IP khác nhau)` : '⚠️ IP không đổi giữa 3 lần thử (có thể không phải proxy xoay, hoặc xoay theo thời gian)'}</div>}
              {test.connected && <div>Google Maps: {test.mapsOk ? `✅ truy cập được (HTTP ${test.maps.status}, ${test.maps.ms} ms)` : test.maps.blocked ? '❌ Google đang chặn/yêu cầu CAPTCHA với IP này' : `❌ lỗi ${test.maps.error || `HTTP ${test.maps.status}`}`}</div>}
            </div>
          )}
          <div className="mt-1 text-[11px] text-slate-400">
            Luồng: {plan.threads.running} đang chạy (tự điều chỉnh {plan.threads.min}–{plan.threads.max} theo RAM/CPU; RAM trống {plan.threads.mem} MB, tải CPU {Math.round(plan.threads.load * 100)}%).
            {plan.hasProxy ? ' Có proxy: chạy đa luồng, không nghỉ chung.' : ' Chưa có proxy: chỉ chạy 1 luồng và nghỉ chung để tránh bị chặn.'}
          </div>
          {!plan.aiEnabled && <div className="text-amber-300 text-[11px] mt-2">AI chưa được cấu hình (menu tài khoản → Cấu hình AI) nên không thể bật lịch.</div>}
        </>
      )}
      {error && <div className="text-red-300 text-xs mt-2">{error}</div>}
    </section>
  );
};
