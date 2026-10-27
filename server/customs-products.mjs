// Phân nhóm sản phẩm cho Customs Data. Mã HS trong vận đơn do người khai tự nhập (cùng mã lẫn dừa, mít, chanh dây)
// nên thứ tự ưu tiên là: mô tả hàng → tên thư mục/tệp nguồn → mã HS (chỉ nhóm rõ ràng). Không khớp → 'khac'.

const strip = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// Thứ tự quan trọng: nhóm cụ thể đặt trước nhóm chung (măng cụt trước xoài, sả trước chanh, chanh dây trước chanh).
export const PRODUCT_GROUPS = [
  { key: 'thanh-long', label: 'Thanh long', words: ['dragon', 'pitaya', 'pitahaya', 'thanh long'] },
  { key: 'chanh-day', label: 'Chanh dây', words: ['passion', 'chanh day', 'maracuja'] },
  { key: 'mang-cut', label: 'Măng cụt', words: ['mangosteen', 'mang cut'] },
  { key: 'xoai', label: 'Xoài', words: ['mango', 'mangoes', 'xoai'] },
  { key: 'dua', label: 'Dừa & sản phẩm từ dừa', words: ['coconut', 'coco', 'copra', 'coir', 'cocos', 'dua', 'cam dua'] },
  { key: 'chuoi', label: 'Chuối', words: ['banana', 'bananas', 'chuoi'] },
  { key: 'mit', label: 'Mít', words: ['jackfruit', 'jack fruit', 'mit'] },
  { key: 'sau-rieng', label: 'Sầu riêng', words: ['durian', 'sau rieng'] },
  { key: 'sa', label: 'Sả', words: ['lemongrass', 'lemon grass', 'citronella'] },
  { key: 'chanh', label: 'Chanh', words: ['lime', 'limes', 'lemon', 'lemons', 'chanh'] },
  { key: 'nhan-vai', label: 'Nhãn, vải, chôm chôm', words: ['longan', 'lychee', 'litchi', 'rambutan', 'nhan', 'vai thieu'] },
  { key: 'oi-buoi', label: 'Ổi, bưởi', words: ['guava', 'pomelo', 'grapefruit', 'oi', 'buoi'] },
  { key: 'trai-cay-khac', label: 'Trái cây khác', words: ['avocado', 'pineapple', 'custard apple', 'star apple', 'papaya', 'jujube', 'tamarind', 'sapodilla', 'thom', 'vu sua'] },
  { key: 'gung', label: 'Gừng', words: ['ginger', 'gung'] },
  { key: 'ot-tieu', label: 'Ớt & tiêu', words: ['chili', 'chilli', 'chilies', 'pepper', 'capsicum', 'ot'] },
  { key: 'rau-cu', label: 'Rau củ', words: ['sweet potato', 'potato', 'cabbage', 'carrot', 'broccoli', 'cauliflower', 'eggplant', 'pumpkin', 'cucumber', 'onion', 'garlic', 'tomato', 'vegetable', 'khoai lang', 'bap cai', 'ca rot', 'rau'] },
  { key: 'dieu-hat', label: 'Hạt điều & hạt', words: ['cashew', 'hat dieu', 'peanut', 'nut', 'macadamia', 'pistachio', 'almond', 'walnut'] },
  { key: 'ca-phe-tra', label: 'Cà phê, trà', words: ['coffee', 'ca phe', 'tea', 'tra den'] },
  { key: 'go-tre', label: 'Gỗ, tre, mây', words: ['plywood', 'veneer', 'timber', 'wood', 'wooden', 'bamboo', 'rattan', 'go van', 'go ep', 'tre '] },
  { key: 'may-mac', label: 'May mặc', words: ['garment', 'apparel', 'clothing', 'may mac', 'quan ao', 'furniture', 'noi that'] },
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
  [/^08011[12]|^08019/, 'dua'], [/^08013/, 'dieu-hat'], [/^0803/, 'chuoi'], [/^080450/, 'xoai'], [/^08055/, 'chanh'],
  [/^091011/, 'gung'], [/^0901|^0902/, 'ca-phe-tra'], [/^4408|^4412/, 'go-tre'], [/^6103|^6203/, 'may-mac'],
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

export const PRODUCT_LABELS = Object.fromEntries([...PRODUCT_GROUPS.map(g => [g.key, g.label]), ['khac', 'Khác / chưa phân loại']]);

// Điền product_group cho các dòng còn NULL (hoặc tất cả khi all=true).
export function backfillProductGroups(db, { all = false } = {}) {
  const cond = all ? '' : 'WHERE product_group IS NULL';
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
