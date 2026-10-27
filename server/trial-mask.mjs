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
