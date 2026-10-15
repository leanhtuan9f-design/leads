// Thành phố lớn / đầu mối nhập khẩu theo quốc gia (tên tiếng Anh như người bản địa gõ trên Google Maps).
// Dùng để gợi ý tức thì sau khi chọn quốc gia, không cần chờ AI. Tìm kiếm = từ khóa + thành phố.
import data from './cities.json';

export const CITIES: Record<string, string[]> = data.cities;
const ALIAS: Record<string, string> = data.alias;

const LOWER = new Map(Object.keys(CITIES).map(k => [k.toLowerCase(), k]));

/** Thành phố gợi ý cho một quốc gia (khớp không phân biệt hoa thường); [] nếu chưa có trong bảng. */
export function citiesFor(country: string): string[] {
  const k = country.trim().toLowerCase();
  const name = LOWER.get(k) || LOWER.get((ALIAS[k] || '').toLowerCase());
  return name ? CITIES[name] : [];
}
