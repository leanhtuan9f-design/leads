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

// Xếp hạng lead đầy đủ thông tin (ưu tiên email) để chọn lead được xem ở gói miễn phí.
export const leadRank = (p) => (p.email ? 8 : 0) + (p.phone ? 4 : 0) + (p.website ? 4 : 0) + (p.address ? 1 : 0) + (p.rating > 0 ? 1 : 0) + (p.openHoursSummary ? 1 : 0) - (p.possiblyClosed ? 6 : 0);

// id của tối đa `limit` lead tốt nhất trong một danh sách kết quả.
export function pickVisibleIds(results, limit) {
  const list = (Array.isArray(results) ? results : []).filter((p) => p && typeof p === 'object' && typeof p.id === 'string');
  return list.map((p, i) => ({ p, i })).sort((a, b) => leadRank(b.p) - leadRank(a.p) || (b.p.reviewsCount || 0) - (a.p.reviewsCount || 0) || a.i - b.i).slice(0, limit).map(({ p }) => p.id);
}

// Lead nằm ngoài 10 lead được xem: giữ id/ngành/quốc gia để đếm và đồng bộ, bỏ mọi thông tin nhận diện công ty.
export function redactPlace(place) {
  return {
    id: place.id, title: 'Công ty ẩn — nâng cấp để xem', category: place.category || '', subcategories: [], address: '', street: '', city: '', state: '', postalCode: '',
    country: place.country || '', phone: '', website: '', email: '', additionalEmails: [], socials: {}, rating: 0, reviewsCount: 0, priceLevel: '',
    isClaimed: false, isOpenNow: false, openHoursSummary: '', latitude: 0, longitude: 0, googleMapsUrl: '', placeId: '', photosCount: 0,
    leadScore: place.leadScore || 0, leadStatus: place.leadStatus || 'cold', scrapedAt: place.scrapedAt || '', hidden: true,
  };
}
