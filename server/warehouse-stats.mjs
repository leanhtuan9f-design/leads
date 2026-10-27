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
  const industries = top('category');
  let cached;
  let expiresAt = 0;
  return () => {
    const time = now();
    if (!cached || time >= expiresAt) {
      cached = { ...summary.get(), countries: countries.all(), industries: industries.all(), generatedAt: time };
      expiresAt = time + cacheMs;
    }
    return cached;
  };
}
