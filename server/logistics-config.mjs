import { setCustomLogistics } from './trade-recommend.mjs';

export function ensureLogisticsSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS logistics_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country TEXT NOT NULL,
    product TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL,
    port TEXT NOT NULL DEFAULT '',
    airport TEXT NOT NULL DEFAULT '',
    logistics_score INTEGER NOT NULL DEFAULT 70,
    logistics_reason TEXT NOT NULL DEFAULT '',
    lat REAL,
    lon REAL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_logistics_country ON logistics_points(country, enabled);`);
}

export function loadLogisticsConfig(db) {
  setCustomLogistics(db.prepare('SELECT country, product, city, port, airport, logistics_score AS logisticsScore, logistics_reason AS logisticsReason, lat, lon, enabled, \'admin\' AS source FROM logistics_points WHERE enabled = 1 ORDER BY logistics_score DESC, city').all());
}

export function logisticsView(db) {
  return db.prepare('SELECT id, country, product, city, port, airport, logistics_score AS logisticsScore, logistics_reason AS logisticsReason, lat, lon, enabled, updated_at AS updatedAt FROM logistics_points ORDER BY country, product, logistics_score DESC, city').all();
}

export function normalizeLogisticsPoint(body = {}) {
  const text = (v, max) => String(v ?? '').trim().slice(0, max);
  const score = Number(body.logisticsScore ?? body.score ?? 70);
  const lat = body.lat === '' || body.lat === null || body.lat === undefined ? null : Number(body.lat);
  const lon = body.lon === '' || body.lon === null || body.lon === undefined ? null : Number(body.lon);
  if (!text(body.country, 120) || !text(body.city, 120)) throw new Error('Cần nhập quốc gia và thành phố');
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('Điểm logistics phải từ 0 đến 100');
  if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) throw new Error('Vĩ độ không hợp lệ');
  if (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) throw new Error('Kinh độ không hợp lệ');
  return { country: text(body.country, 120), product: text(body.product, 160), city: text(body.city, 120), port: text(body.port, 160), airport: text(body.airport, 160), logisticsScore: Math.round(score), logisticsReason: text(body.logisticsReason || body.reason, 300), lat, lon, enabled: body.enabled === false ? 0 : 1 };
}
