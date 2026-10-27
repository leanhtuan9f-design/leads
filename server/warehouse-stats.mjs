import { BUYER_SEGMENTS, classifyBuyerSegment } from '../shared/buyer-segments.mjs';
// Public aggregate counts only; never expose individual records or account data.
export function createWarehouseStats(db, { cacheMs = 15000, now = Date.now } = {}) {
  const summary = db.prepare('SELECT COUNT(*) AS total, MAX(last_seen) AS lastUpdatedAt FROM places');
  const top = (field) => db.prepare(`
    SELECT trim(json_extract(data, '$.${field}')) AS name, COUNT(*) AS count
    FROM places
    WHERE json_valid(data) AND json_type(data, '$.${field}') = 'text'
      AND trim(json_extract(data, '$.${field}')) <> ''
    GROUP BY name ORDER BY count DESC, name ASC LIMIT 5
  `);
  const countries = top('country');
  const products = db.prepare(`
    WITH task_products AS (
      SELECT id, trim(substr(plan_group, 1, instr(plan_group, '|') - 1)) AS hsCode,
        trim(substr(plan_group, instr(plan_group, '|') + 1)) AS name
      FROM auto_tasks WHERE instr(plan_group, '|') > 1
    )
    SELECT t.hsCode, MIN(t.name) AS name, COUNT(DISTINCT p.place_id) AS count
    FROM task_products t JOIN auto_runs r ON r.task_id = t.id
      JOIN query_places qp ON qp.qkey = r.qkey JOIN places p ON p.place_id = qp.place_id
    WHERE length(t.hsCode) IN (2,4,6,8) AND t.hsCode NOT GLOB '*[^0-9]*' AND t.name <> ''
    GROUP BY t.hsCode ORDER BY count DESC, t.hsCode ASC LIMIT 5
  `);
  let cached;
  let expiresAt = 0;
  return () => {
    const time = now();
    if (!cached || time >= expiresAt) {
      cached = { ...summary.get(), countries: countries.all(), products: products.all(), generatedAt: time };
      expiresAt = time + cacheMs;
    }
    return cached;
  };
}

// Internal review only; keep role guesses out of the public statistics contract.
export function createWarehouseSegments(db, { cacheMs = 15000, now = Date.now } = {}) {
  const roles = db.prepare(`SELECT json_extract(data, '$.category') AS category,
    json_extract(data, '$.subcategories') AS subcategories, COUNT(*) AS count
    FROM places WHERE json_valid(data) GROUP BY category, subcategories`);
  const summary = db.prepare('SELECT COUNT(*) AS total FROM places');
  let cached;
  let expiresAt = 0;
  return () => {
    const time = now();
    if (!cached || time >= expiresAt) {
      const totals = Object.fromEntries(BUYER_SEGMENTS.map(segment => [segment.id, 0]));
      let valid = 0;
      for (const row of roles.all()) {
        let subcategories = [];
        try { subcategories = JSON.parse(row.subcategories || '[]'); } catch { /* unknown metadata */ }
        totals[classifyBuyerSegment({ category: row.category, subcategories })] += row.count;
        valid += row.count;
      }
      const { total } = summary.get();
      totals.other += total - valid;
      cached = { total, segments: BUYER_SEGMENTS.map(segment => ({ ...segment, count: totals[segment.id] })), segmentationVersion: 'source-role-v1', importerVerification: 'not_assessed', generatedAt: time };
      expiresAt = time + cacheMs;
    }
    return cached;
  };
}
