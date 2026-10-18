import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { apiJson } from '../auth/types';

interface Item { id: string }
interface PullResponse<T> { items: { id: string; data: T | null; deleted: boolean; seq: number }[]; more: boolean; last: number }

const CHUNK = 500;
const PUSH_DELAY_MS = 800;
const POLL_MS = 15000;

// Đồng bộ một danh sách (lead/job) với server theo từng dòng:
// - mở trang: kéo toàn bộ từ server, dòng chỉ có ở máy này (localStorage/khóa cũ) được đẩy lên
// - sửa/thêm/xóa: chỉ gửi phần thay đổi (diff so với lần đồng bộ trước)
// - quay lại tab: kéo thay đổi mới từ thiết bị khác, gộp theo id (dòng đang sửa dở ở máy này được ưu tiên)
export function useSyncedList<T extends Item>(
  kind: 'leads' | 'jobs',
  items: T[],
  setItems: Dispatch<SetStateAction<T[]>>,
  sort?: (a: T, b: T) => number,
  options?: { canRemove?: boolean }
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synced = useRef(new Map<string, string>()); // id -> JSON đã có trên server
  const lastSeq = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const canRemove = options?.canRemove ?? true;

  const pull = useCallback(async () => {
    const fetched: PullResponse<T>['items'] = [];
    for (;;) {
      const r = await apiJson<PullResponse<T>>(`/items/${kind}?after=${lastSeq.current}&limit=1000`);
      fetched.push(...r.items);
      lastSeq.current = r.last;
      if (!r.more) break;
    }
    if (fetched.length === 0) return;
    // dòng mới nhất (seq lớn nhất) cho mỗi id
    const latest = new Map<string, PullResponse<T>['items'][number]>();
    for (const it of fetched) latest.set(it.id, it);
    setItems(prev => {
      const byId = new Map(prev.map(x => [x.id, x]));
      const fresh: T[] = [];
      const removed = new Set<string>();
      for (const it of Array.from(latest.values()).sort((a, b) => b.seq - a.seq)) {
        const local = byId.get(it.id);
        const localJson = local ? JSON.stringify(local) : null;
        const known = synced.current.get(it.id); // chưa từng đồng bộ trong phiên này → server là nguồn đúng
        const dirty = localJson !== null && known !== undefined && localJson !== known;
        if (it.deleted) {
          if (!dirty) { removed.add(it.id); synced.current.delete(it.id); }
          continue;
        }
        const json = JSON.stringify(it.data);
        if (local && dirty) continue; // sửa dở ở máy này → giữ, sẽ đẩy lên sau
        synced.current.set(it.id, json);
        if (local) byId.set(it.id, it.data as T);
        else fresh.push(it.data as T);
      }
      const next = [...fresh, ...prev.map(x => byId.get(x.id) as T)].filter(x => !removed.has(x.id));
      return sort ? next.sort(sort) : next;
    });
  }, [kind, setItems, sort]);

  // Tải lần đầu
  useEffect(() => {
    let cancelled = false;
    pull()
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setError('Không tải được dữ liệu từ máy chủ — đang dùng bản lưu trong trình duyệt.'); });
    return () => { cancelled = true; };
  }, [pull]);

  // Quay lại tab + hỏi định kỳ → lấy thay đổi từ thiết bị khác (gần realtime)
  useEffect(() => {
    if (!ready) return;
    const tick = () => { if (document.visibilityState === 'visible') pull().catch(() => {}); };
    document.addEventListener('visibilitychange', tick);
    const iv = setInterval(tick, POLL_MS);
    return () => { document.removeEventListener('visibilitychange', tick); clearInterval(iv); };
  }, [ready, pull]);

  // Đẩy phần thay đổi
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        const cur = itemsRef.current;
        const ids = new Set<string>();
        const upsert: { id: string; json: string; item: T }[] = [];
        for (const it of cur) {
          ids.add(it.id);
          const json = JSON.stringify(it);
          if (synced.current.get(it.id) !== json) upsert.push({ id: it.id, json, item: it });
        }
        const remove = canRemove ? Array.from(synced.current.keys()).filter(id => !ids.has(id)) : [];
        if (upsert.length === 0 && remove.length === 0) return;
        try {
          for (let i = 0; i < upsert.length; i += CHUNK) {
            const part = upsert.slice(i, i + CHUNK);
            await apiJson(`/items/${kind}`, 'POST', { upsert: part.map(p => p.item) });
            for (const p of part) synced.current.set(p.id, p.json);
          }
          for (let i = 0; i < remove.length; i += CHUNK) {
            const part = remove.slice(i, i + CHUNK);
            await apiJson(`/items/${kind}`, 'POST', { remove: part });
            for (const id of part) synced.current.delete(id);
          }
          setError(null);
        } catch {
          setError('Chưa lưu được lên máy chủ — sẽ thử lại ở lần thay đổi sau.');
        }
      });
    }, PUSH_DELAY_MS);
    return () => clearTimeout(t);
  }, [items, ready, kind]);

  return { ready, error };
}
