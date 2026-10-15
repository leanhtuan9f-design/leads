import type { ScrapedBusiness } from '../types/scraper';

// Bảng tra quốc gia: tên (en/vi, không phân biệt hoa thường/dấu) và mã ISO -> mã ISO
// Mã lỗi thời / vùng gộp không phải quốc gia
const SKIP = new Set(['DD', 'YD', 'SU', 'CS', 'YU', 'ZR', 'BU', 'TP', 'NT', 'AN', 'FX', 'QO', 'ZZ', 'EU', 'UN', 'EZ', 'XA', 'XB', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA']);
let nameToCode: Map<string, string> | null = null;
let dnVi: Intl.DisplayNames | null = null;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

function table(): Map<string, string> {
  if (nameToCode) return nameToCode;
  nameToCode = new Map();
  try {
    const en = new Intl.DisplayNames(['en'], { type: 'region' });
    dnVi = new Intl.DisplayNames(['vi'], { type: 'region' });
    const native = ['de', 'fr', 'es', 'it', 'ja', 'ko', 'zh', 'nl', 'pt', 'ru', 'th', 'id', 'tr'].map(l => new Intl.DisplayNames([l], { type: 'region' }));
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const a of A) for (const b of A) {
      const code = a + b;
      if (SKIP.has(code)) continue;
      const n = en.of(code);
      if (!n || n === code) continue; // mã không tồn tại
      nameToCode.set(fold(n), code);
      const v = dnVi.of(code);
      if (v && v !== code) nameToCode.set(fold(v), code);
      for (const dn of native) { const x = dn.of(code); if (x && x !== code && !nameToCode.has(fold(x))) nameToCode.set(fold(x), code); }
    }
  } catch { /* trình duyệt cũ: chỉ còn nhận mã */ }
  const alias: Record<string, string> = { usa: 'US', 'u.s.a.': 'US', uk: 'GB', 'united kingdom': 'GB', 'viet nam': 'VN', vietnam: 'VN', korea: 'KR', 'south korea': 'KR', russia: 'RU', uae: 'AE', 'hong kong': 'HK', taiwan: 'TW' };
  for (const [k, v] of Object.entries(alias)) nameToCode.set(k, v);
  return nameToCode;
}

const toCode = (raw: string): string => {
  const t = raw.trim();
  if (!t) return '';
  if (/^[A-Za-z]{2}$/.test(t)) { const u = t.toUpperCase(); return u === 'UK' ? 'GB' : SKIP.has(u) ? '' : u; }
  return table().get(fold(t)) || '';
};

/** Mã ISO quốc gia của lead: ưu tiên trường country, không có thì tìm tên nước ở cuối địa chỉ. */
export function countryCode(b: Pick<ScrapedBusiness, 'country' | 'address'>): string {
  const direct = toCode(b.country || '');
  if (direct) return direct;
  const parts = (b.address || '').split(',').map(p => p.replace(/\d+/g, '').trim()).filter(Boolean);
  for (const p of parts.slice(-2).reverse()) {
    const c = toCode(p.length === 2 && p.toUpperCase() !== 'UK' ? '' : p); // không đoán từ mảnh 2 ký tự trong địa chỉ (dễ nhầm mã bang)
    if (c) return c;
  }
  return '';
}

export function countryLabel(code: string): string {
  table();
  try { return dnVi?.of(code) || code; } catch { return code; }
}
