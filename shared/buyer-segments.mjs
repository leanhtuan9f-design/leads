// Role signals from source categories, never evidence of actual imports or purchase intent.
export const BUYER_SEGMENTS = [
  { id: 'import_signal', name: 'Có nhãn nhập khẩu — chưa xác minh', description: 'Ngành chính/phụ có nhãn nhà nhập khẩu hoặc xuất nhập khẩu; cần kiểm tra hoạt động, sản phẩm và pháp nhân.' },
  { id: 'distribution', name: 'Bán buôn / phân phối — cần thẩm định', description: 'Có nhãn bán buôn hoặc phân phối; có thể mua trong nước, chưa chứng minh nhập khẩu trực tiếp.' },
  { id: 'market_retail', name: 'Chợ / bán lẻ — tệp tham khảo', description: 'Chợ, điểm bán hoặc bán lẻ; chưa xác định đơn vị mua hàng và năng lực nhập khẩu.' },
  { id: 'manufacturing', name: 'Sản xuất — cần xác định đầu vào', description: 'Có nhãn sản xuất; chỉ phù hợp khi xác định được nhu cầu nguyên liệu hoặc linh kiện của nhà máy.' },
  { id: 'other', name: 'Khác / chưa đủ thông tin', description: 'Nhãn chung, dịch vụ hoặc thiếu dữ liệu; chưa đủ cơ sở xếp vào tệp mua hàng.' },
];
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
export function classifyBuyerSegment(record = {}) {
  const primary = norm(record.category);
  const categories = [primary, ...(Array.isArray(record.subcategories) ? record.subcategories.filter(x => typeof x === 'string').map(norm) : [])];
  // Service intermediaries and marketplaces are not inferred to be import buyers.
  if (categories.some(x => /customs broker|freight forward|logistics|dich vu.*nhap khau|moi gioi.*hai quan|dich vu.*hai quan/.test(x))) return 'other';
  if (categories.some(x => /\bimporter\b|\bimporters\b|\bimport export company\b|\bimport-export company\b|\bnha nhap khau\b|\bcong ty xuat nhap khau\b|\bnha ban buon va nhap khau\b/.test(x))) return 'import_signal';
  // A wholesale market is a venue/cluster, not automatically a buying company.
  if (/\bcho\b|\bmarketplace\b|\bfarmers.? market\b|\bwholesale market\b/.test(primary)) return 'market_retail';
  if (categories.some(x => /\bban buon\b|\bwholesal(?:e|er|ers)\b|\bphan phoi\b|\bdistribut(?:or|ors|ion)\b/.test(x))) return 'distribution';
  if (categories.some(x => /\bsan xuat\b|\bmanufacturer\b|\bmanufacturers\b|\bfactory\b/.test(x))) return 'manufacturing';
  if (categories.some(x => /\bcua hang\b|\bsieu thi\b|\bcho\b|\bretail\b|\bsupermarket\b|\bgrocery store\b/.test(x))) return 'market_retail';
  return 'other';
}
