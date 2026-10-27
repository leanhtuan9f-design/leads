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
  // Group identical metadata first so classification does not load all company records.
  const roles = db.prepare(`SELECT json_extract(data, '$.category') AS category,
    json_extract(data, '$.subcategories') AS subcategories, COUNT(*) AS count
    FROM places WHERE json_valid(data) GROUP BY category, subcategories`);
  const countries = top('country');
  const industries = top('category');
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
      const summaryRow = summary.get();
      totals.other += summaryRow.total - valid;
      cached = { ...summaryRow, segments: BUYER_SEGMENTS.map(segment => ({ ...segment, count: totals[segment.id] })), segmentationVersion: 'source-role-v1', importerVerification: 'not_assessed', countries: countries.all(), industries: industries.all(), generatedAt: time };
      expiresAt = time + cacheMs;
    }
    return cached;
  };
}
