import { normCountry } from './billing.mjs';

// Kiểm tra giới hạn tìm kiếm theo gói trước khi tạo job (0 = không giới hạn). Hàm thuần để kiểm thử được.
//   limits: kết quả billing.limitsFor (null = không có gói/admin → không giới hạn)
//   searchesToday: số search đã tạo hôm nay; activeSearches: số job của user chưa kết thúc; country: nước client gửi lên
// Trả { ok: true, lockCountry? } hoặc { ok: false, status, body }. lockCountry = nước cần khoá thêm (tài khoản cũ chưa chọn đủ nước).
export function checkSearchLimits({ limits, searchesToday = 0, activeSearches = 0, country = '' }) {
  if (!limits) return { ok: true };
  if (limits.dailySearches > 0 && searchesToday >= limits.dailySearches) {
    return { ok: false, status: 429, body: { error: `Gói của bạn có tối đa ${limits.dailySearches} lượt tìm kiếm mỗi ngày. Lượt đặt lại vào 0h (giờ Việt Nam).`, code: 'DAILY_SEARCH_LIMIT' } };
  }
  if (limits.maxConcurrentSearches > 0 && activeSearches >= limits.maxConcurrentSearches) {
    return { ok: false, status: 429, body: { error: `Gói của bạn chạy tối đa ${limits.maxConcurrentSearches} tìm kiếm cùng lúc. Hãy đợi tìm kiếm hiện tại xong hoặc hủy nó.`, code: 'SEARCH_IN_PROGRESS' } };
  }
  if (limits.maxCountries > 0) {
    const name = String(country || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!name) return { ok: false, status: 422, body: { error: 'Hãy chọn quốc gia để tìm kiếm.', code: 'COUNTRY_REQUIRED' } };
    const allowed = limits.countries || [];
    if (!allowed.some((c) => normCountry(c) === normCountry(name))) {
      if (allowed.length >= limits.maxCountries) {
        return { ok: false, status: 403, body: { error: `Gói của bạn chỉ tìm kiếm trong ${limits.maxCountries} quốc gia${allowed.length ? ` (${allowed.join(', ')})` : ''}. Mua thêm quốc gia hoặc nâng cấp gói Nâng cao để tìm nhiều nước.`, code: 'COUNTRY_LOCKED' } };
      }
      return { ok: true, lockCountry: name };
    }
  }
  return { ok: true };
}
