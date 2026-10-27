import { opaqueLeadId } from './trial-mask.mjs';

// Một lần (cờ app_settings.leadIdsOpaque): đổi mã lead cũ lead_<placeId> trong user_items (và results của job) sang lead_h_<hash>.
// Dòng đổi được tăng seq để thiết bị khác kéo lại. Trả về số dòng đã sửa.
export function migrateLeadIds(db) {
  if (db.prepare("SELECT 1 FROM app_settings WHERE key = 'leadIdsOpaque'").get()) return 0;
  let changed = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const seqOf = db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM user_items WHERE user_id = ? AND kind = ?');
    const exists = db.prepare('SELECT 1 FROM user_items WHERE user_id = ? AND kind = ? AND item_id = ?');
    const del = db.prepare('DELETE FROM user_items WHERE user_id = ? AND kind = ? AND item_id = ?');
    const rename = db.prepare('UPDATE user_items SET item_id = ?, data = ?, seq = ? WHERE user_id = ? AND kind = ? AND item_id = ?');
    const setData = db.prepare('UPDATE user_items SET data = ?, seq = ? WHERE user_id = ? AND kind = ? AND item_id = ?');
    const seqs = new Map();
    const nextSeq = (uid, kind) => {
      const k = `${uid}|${kind}`;
      if (!seqs.has(k)) seqs.set(k, seqOf.get(uid, kind).m);
      seqs.set(k, seqs.get(k) + 1);
      return seqs.get(k);
    };
    for (const r of db.prepare('SELECT user_id, kind, item_id, data FROM user_items').all()) {
      let data; try { data = JSON.parse(r.data); } catch { data = null; }
      if (r.kind === 'lead' && !r.item_id.startsWith('lead_h_')) {
        const id = opaqueLeadId(r.item_id);
        if (data && typeof data === 'object') data.id = id;
        if (exists.get(r.user_id, r.kind, id)) del.run(r.user_id, r.kind, r.item_id);
        else rename.run(id, JSON.stringify(data), nextSeq(r.user_id, r.kind), r.user_id, r.kind, r.item_id);
        changed++;
      } else if (r.kind === 'job' && data && JSON.stringify(data).includes('"id":"lead_') && /"id":"lead_(?!h_)/.test(JSON.stringify(data))) {
        const fix = (list) => (Array.isArray(list) ? list.map((p) => (p && typeof p.id === 'string' ? { ...p, id: opaqueLeadId(p.id) } : p)) : list);
        data.results = fix(data.results);
        if (data.options && Array.isArray(data.options.existingBusinesses)) data.options.existingBusinesses = fix(data.options.existingBusinesses);
        setData.run(JSON.stringify(data), nextSeq(r.user_id, r.kind), r.user_id, r.kind, r.item_id);
        changed++;
      }
    }
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('leadIdsOpaque', '1')").run();
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return changed;
}
