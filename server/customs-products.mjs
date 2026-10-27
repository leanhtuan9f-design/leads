// Phân nhóm sản phẩm cho Customs Data. Mã HS trong vận đơn do người khai tự nhập (cùng mã lẫn dừa, mít, chanh dây)
// nên thứ tự ưu tiên là: mô tả hàng → tên thư mục/tệp nguồn → mã HS (chỉ nhóm rõ ràng). Không khớp → 'khac'.

const strip = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// Thứ tự quan trọng: nhóm cụ thể đặt trước nhóm chung (măng cụt trước xoài, sả trước chanh, chanh dây trước chanh).
export const PRODUCT_GROUPS = [
  { key: 'thanh-long', label: 'Dragon fruit', words: ['dragon', 'pitaya', 'pitahaya', 'thanh long'] },
  { key: 'chanh-day', label: 'Passion fruit', words: ['passion', 'chanh day', 'maracuja'] },
  { key: 'mang-cut', label: 'Mangosteen', words: ['mangosteen', 'mang cut'] },
  { key: 'xoai', label: 'Mango', words: ['mango', 'mangoes', 'xoai'] },
  { key: 'dua', label: 'Coconut & coconut products', words: ['coconut', 'coco', 'copra', 'coir', 'cocos', 'dua', 'cam dua'] },
  { key: 'chuoi', label: 'Banana', words: ['banana', 'bananas', 'chuoi'] },
  { key: 'mit', label: 'Jackfruit', words: ['jackfruit', 'jack fruit', 'mit'] },
  { key: 'sau-rieng', label: 'Durian', words: ['durian', 'sau rieng'] },
  { key: 'sa', label: 'Lemongrass', words: ['lemongrass', 'lemon grass', 'citronella'] },
  { key: 'chanh', label: 'Lime & lemon', words: ['lime', 'limes', 'lemon', 'lemons', 'chanh'] },
  { key: 'nhan-vai', label: 'Longan, lychee, rambutan', words: ['longan', 'lychee', 'litchi', 'rambutan', 'nhan', 'vai thieu'] },
  { key: 'oi-buoi', label: 'Guava & pomelo', words: ['guava', 'pomelo', 'grapefruit', 'oi', 'buoi'] },
  { key: 'trai-cay-khac', label: 'Other fruits', words: ['avocado', 'pineapple', 'custard apple', 'star apple', 'papaya', 'jujube', 'tamarind', 'sapodilla', 'thom', 'vu sua'] },
  { key: 'gung', label: 'Ginger', words: ['ginger', 'gung'] },
  { key: 'ot-tieu', label: 'Chili & pepper', words: ['chili', 'chilli', 'chilies', 'pepper', 'capsicum', 'ot'] },
  { key: 'rau-cu', label: 'Vegetables', words: ['sweet potato', 'potato', 'cabbage', 'carrot', 'broccoli', 'cauliflower', 'eggplant', 'pumpkin', 'cucumber', 'onion', 'garlic', 'tomato', 'vegetable', 'khoai lang', 'bap cai', 'ca rot', 'rau'] },
  { key: 'hoa-nam', label: 'Flowers & mushrooms', words: ['flower', 'flowers', 'lily', 'lilies', 'hydrangea', 'orchid', 'chrysanthemum', 'rose', 'fern', 'mushroom', 'hoa tuoi', 'nam rom', 'nam huong'] },
  { key: 'dieu-hat', label: 'Cashew & nuts', words: ['cashew', 'hat dieu', 'peanut', 'nut', 'macadamia', 'pistachio', 'almond', 'walnut'] },
  { key: 'ca-phe-tra', label: 'Coffee & tea', words: ['coffee', 'ca phe', 'tea', 'tra den'] },
  { key: 'go-tre', label: 'Wood, bamboo, rattan', words: ['plywood', 'veneer', 'timber', 'wood', 'wooden', 'bamboo', 'rattan', 'go van', 'go ep', 'tre '] },
  { key: 'may-mac', label: 'Garments & furniture', words: ['garment', 'apparel', 'clothing', 'may mac', 'quan ao', 'furniture', 'noi that'] },
];

const boundary = w => `(?<![a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +$/, '(?![a-z])')}(?:s|es)?(?![a-z0-9])`;
const MATCHERS = PRODUCT_GROUPS.map(g => ({ key: g.key, re: new RegExp(g.words.map(boundary).join('|')) }));

// Mã HS thường mất số 0 đầu khi lưu dạng số (8109094 = 08109094): bù về chuẩn 8 chữ số.
export function normalizeHs(hs) {
  const d = String(hs ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length % 2 === 1 ? `0${d}` : d;
}

// Chỉ những đầu mã HS ít sai: dùng khi mô tả và thư mục không nói gì.
const HS_FALLBACK = [
  [/^08011[12]|^08019/, 'dua'], [/^08013/, 'dieu-hat'], [/^0803/, 'chuoi'], [/^0810/, 'trai-cay-khac'], [/^080450/, 'xoai'], [/^08055/, 'chanh'],
  [/^091011/, 'gung'], [/^0901|^0902/, 'ca-phe-tra'], [/^0603|^0604|^07095|^071231/, 'hoa-nam'], [/^4408|^4412/, 'go-tre'], [/^6103|^6203/, 'may-mac'],
];

function match(text) {
  const t = strip(text);
  if (!t.trim()) return '';
  for (const m of MATCHERS) if (m.re.test(t)) return m.key;
  return '';
}

// description: mô tả hàng/ghi chú; source: đường dẫn tệp nguồn (+ thư mục); hs: mã HS gốc.
export function productGroup({ description = '', source = '', hs = '' } = {}) {
  const byDesc = match(description);
  if (byDesc) return byDesc;
  const bySource = match(String(source).replace(/\.(xlsx?|csv)$/i, '').replace(/\d{6,}/g, ' '));
  if (bySource) return bySource;
  const h = normalizeHs(hs);
  const hit = h && HS_FALLBACK.find(([re]) => re.test(h));
  return hit ? hit[1] : 'khac';
}

export const PRODUCT_LABELS = Object.fromEntries([...PRODUCT_GROUPS.map(g => [g.key, g.label]), ['khac', 'Other / unclassified']]);

// Điền product_group cho các dòng còn NULL (hoặc tất cả khi all=true).
export function backfillProductGroups(db, { all = false } = {}) {
  const cond = all ? '' : 'WHERE product_group IS NULL';
  if (all) db.exec('UPDATE customs_rankings SET product_inferred = 0');
  const upd = (table, sel, make) => {
    const rows = db.prepare(`SELECT id, ${sel} FROM ${table} ${cond}`).all();
    if (!rows.length) return 0;
    const set = db.prepare(`UPDATE ${table} SET product_group = ? WHERE id = ?`);
    db.exec('BEGIN');
    try { for (const r of rows) set.run(make(r), r.id); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return rows.length;
  };
  return {
    shipments: upd('customs_shipments', 'product, file, hs', r => productGroup({ description: r.product, source: r.file, hs: r.hs })),
    rankings: upd('customs_rankings', 'product, file, hs', r => productGroup({ source: `${r.file} ${r.product}`, hs: r.hs })),
    market: upd('customs_market', 'product, file', r => productGroup({ source: `${r.file} ${r.product}` })),
  };
}

// Tệp trộn nhiều sản phẩm (UK Buyer List, Fresh Air Exports…) không nói sản phẩm trong đường dẫn: suy từ chính vận đơn của
// buyer/supplier đó, bổ sung bằng các danh sách khác có cùng tên. Chọn nhóm có nhiều dòng nhất; dòng được suy đánh dấu product_inferred = 1.
export function inferRankingProducts(db) {
  const tally = (sql) => {
    const m = new Map();
    for (const r of db.prepare(sql).all()) { const c = m.get(r.nn) || new Map(); c.set(r.g, (c.get(r.g) || 0) + r.n); m.set(r.nn, c); }
    return m;
  };
  const top = c => (c && c.size ? [...c].sort((a, b) => b[1] - a[1])[0][0] : '');
  const out = {};
  for (const [role, shipCol] of [['buyer', 'buyer_norm'], ['supplier', 'supplier_norm']]) {
    const ship = tally(`SELECT ${shipCol} nn, product_group g, COUNT(*) n FROM customs_shipments WHERE ${shipCol} <> '' AND product_group <> 'khac' GROUP BY 1, 2`);
    const other = tally(`SELECT name_norm nn, product_group g, COUNT(*) n FROM customs_rankings WHERE role = '${role}' AND product_group <> 'khac' AND product_inferred = 0 GROUP BY 1, 2`);
    const rows = db.prepare(`SELECT id, name_norm FROM customs_rankings WHERE role = ? AND product_group = 'khac'`).all(role);
    const set = db.prepare('UPDATE customs_rankings SET product_group = ?, product_inferred = 1 WHERE id = ?');
    let n = 0;
    db.exec('BEGIN');
    for (const r of rows) {
      const merged = new Map(ship.get(r.name_norm) || []);
      for (const [g, c] of other.get(r.name_norm) || []) merged.set(g, (merged.get(g) || 0) + c);
      const g = top(merged);
      if (g) { set.run(g, r.id); n++; }
    }
    db.exec('COMMIT');
    out[role] = n;
  }
  return out;
}
