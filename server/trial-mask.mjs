// Che một phần liên hệ trước khi gửi cho tài khoản dùng thử: dữ liệu gốc không rời máy chủ.
export function maskEmail(email) {
  const value = String(email || '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1) return value ? '***' : '';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, Math.min(2, local.length - 1) || 1)}***@${host.slice(0, 1)}***${tld}`;
}

// Giữ tối đa 3 chữ số đầu (mã vùng) và 2 chữ số cuối, các chữ số còn lại thành •.
export function maskPhone(phone) {
  const value = String(phone || '').trim();
  const digits = (value.match(/\d/g) || []).length;
  if (!digits) return value ? '•••' : '';
  const head = Math.min(3, Math.max(0, digits - 4));
  const tail = digits > 4 ? 2 : 0;
  let seen = 0;
  return value.replace(/\d/g, (d) => (++seen <= head || seen > digits - tail ? d : '•'));
}

// Chỉ giữ chữ cái đầu của tên miền và đuôi: https://www.acme-coffee.com/shop → a***.com (bỏ đường dẫn, không còn là link dùng được).
export function maskWebsite(website) {
  const value = String(website || '').trim();
  if (!value) return '';
  const host = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
  const dot = host.lastIndexOf('.');
  if (dot < 1) return '***';
  return `${host.slice(0, 1)}***${host.slice(dot)}`;
}

export function maskTrialPlace(place) {
  return {
    ...place,
    email: maskEmail(place.email),
    additionalEmails: (place.additionalEmails || []).map(maskEmail),
    phone: maskPhone(place.phone),
    website: maskWebsite(place.website),
  };
}

// Mã lead không lộ placeId/cid của Google: lead_<placeId> → lead_h_<24 hex của SHA-256>. Idempotent.
import { createHash } from 'node:crypto';
export function opaqueLeadId(id) {
  const value = String(id ?? '');
  if (value.startsWith('lead_h_')) return value;
  return `lead_h_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

// Điểm lead theo đúng thang của client (calculateLeadScore trong scraperEngine.ts): server chưa có điểm khi lead mới về nên tính lại cùng công thức.
export function leadScoreOf(p) {
  let score = 50;
  if (p.phone) score += 15;
  if (p.website) score += 15;
  if (p.email) score += 15;
  if (p.socials && Object.keys(p.socials).length > 0) score += 5;
  if ((p.reviewsCount || 0) > 50) score += 5;
  if ((p.rating || 0) >= 4.5) score += 5;
  if (!p.isClaimed) score += 10;
  return Math.min(100, Math.max(10, score));
}

// Thứ tự chọn lead được xem ở gói miễn phí: điểm lead cao nhất trước; hòa điểm thì lead đầy đủ thông tin hơn, nhiều review hơn.
export const compareLeads = (a, b) => leadScoreOf(b) - leadScoreOf(a) || leadRank(b) - leadRank(a) || (b.reviewsCount || 0) - (a.reviewsCount || 0);

// Xếp hạng phụ khi hòa điểm
export const leadRank = (p) => (p.email ? 8 : 0) + (p.phone ? 4 : 0) + (p.website ? 4 : 0) + (p.address ? 1 : 0) + (p.rating > 0 ? 1 : 0) + (p.openHoursSummary ? 1 : 0) - (p.possiblyClosed ? 6 : 0);

// id của tối đa `limit` lead tốt nhất trong một danh sách kết quả.
export function pickVisibleIds(results, limit) {
  const list = (Array.isArray(results) ? results : []).filter((p) => p && typeof p === 'object' && typeof p.id === 'string');
  return list.map((p, i) => ({ p, i })).sort((a, b) => compareLeads(a.p, b.p) || a.i - b.i).slice(0, limit).map(({ p }) => p.id);
}

// Mỗi từ của tên công ty chỉ giữ 3 chữ cái đầu: "Hamburg Coffee Company" → "Ham*** Cof*** Com***".
export function maskName(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).map((w) => (w.length <= 3 ? `${w.slice(0, 1)}**` : `${w.slice(0, 3)}***`)).join(' ');
}

// Lead nằm ngoài 10 lead được xem: ẩn MỘT PHẦN thông tin công ty (tên rút gọn, bỏ địa chỉ chi tiết, liên hệ che nhiều hơn,
// toạ độ làm tròn ~10km, không còn link Maps/placeId). Giữ ngành, thành phố, quốc gia, đánh giá để vẫn thấy quy mô thị trường.
export function redactPlace(place) {
  return {
    ...maskTrialPlace(place),
    title: maskName(place.title), address: place.city ? `${place.city}, ${place.country || ''}`.replace(/, $/, '') : '', street: '', postalCode: '',
    socials: {}, openHoursSummary: '', googleMapsUrl: '', placeId: '', photosCount: 0,
    latitude: Math.round((Number(place.latitude) || 0) * 10) / 10, longitude: Math.round((Number(place.longitude) || 0) * 10) / 10,
    hidden: true,
  };
}
