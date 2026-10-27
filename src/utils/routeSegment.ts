import { useEffect, useState } from 'react';

// Đường dẫn dạng /<tab>/<tab-nhỏ>/<tab-con>/ ; mọi thay đổi đều phát sự kiện để các thành phần đọc lại.
const ROUTE_EVENT = 'app:routechange';
const segments = () => window.location.pathname.split('/').filter(Boolean);

export function navigatePath(parts: string[]) {
  const target = `/${parts.join('/')}/`;
  if (window.location.pathname === target) return;
  window.history.pushState(null, '', target + window.location.search);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

// Tab nhỏ nằm sau `tabSlug` và các đoạn cha `parents`; trả null nếu URL chưa chọn tab nhỏ hợp lệ.
export function useRouteSegment<T extends string>(tabSlug: string, parents: string[], allowed: readonly T[]): [T | null, (value: T) => void] {
  const read = (): T | null => {
    const s = segments();
    if (s[0] !== tabSlug || parents.some((p, i) => s[i + 1] !== p)) return null;
    const v = s[parents.length + 1];
    return (allowed as readonly string[]).includes(v) ? (v as T) : null;
  };
  const [value, setValue] = useState<T | null>(read);
  const parentKey = parents.join('/');
  useEffect(() => {
    const sync = () => setValue(read());
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener(ROUTE_EVENT, sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener(ROUTE_EVENT, sync); };
  }, [tabSlug, parentKey]);
  return [value, (v: T) => navigatePath([tabSlug, ...parents, v])];
}
