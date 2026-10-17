import { lazy, type ComponentType } from 'react';

/** Như `lazy`, nhưng khi tải chunk thất bại (thường do tab cũ gọi tệp đã bị xóa sau khi deploy bản mới) thì tự tải lại trang một lần để lấy bản mới. */
export function lazyReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (e) {
      const key = 'gmaps_chunk_reload';
      let last = 0;
      try { last = Number(sessionStorage.getItem(key) || 0); } catch { /* bỏ qua */ }
      if (Date.now() - last > 15000) {
        try { sessionStorage.setItem(key, String(Date.now())); } catch { /* bỏ qua */ }
        window.location.reload();
        return new Promise<never>(() => { /* chờ trang tải lại */ });
      }
      throw e;
    }
  });
}
