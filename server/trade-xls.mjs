import XLSX from 'xlsx';

const ISO = {
  'Ai-len': 'IRL', 'Áo': 'AUT', 'Argentina': 'ARG', 'Australia': 'AUS', 'Ba Lan': 'POL', 'Bỉ': 'BEL',
  'Brazil': 'BRA', 'Brunei': 'BRN', 'Bulgaria': 'BGR', 'Campuchia': 'KHM', 'Canada': 'CAN', 'Chile': 'CHL',
  'Trung Quốc': 'CHN', 'Côte d’Ivoire': 'CIV', 'Croatia': 'HRV', 'Cộng hòa Séc': 'CZE', 'Đan Mạch': 'DNK',
  'Estonia': 'EST', 'Phần Lan': 'FIN', 'Pháp': 'FRA', 'Đức': 'DEU', 'Hy Lạp': 'GRC', 'Đặc khu HC Hồng Công (TQ)': 'HKG',
  'Hungary': 'HUN', 'Ấn Độ': 'IND', 'Indonesia': 'IDN', 'Israel': 'ISR', 'Italia': 'ITA', 'Nhật Bản': 'JPN',
  'Kazakhstan': 'KAZ', 'Kuwait': 'KWT', 'Lào': 'LAO', 'Latvia': 'LVA', 'Litva': 'LTU', 'Luxembourg': 'LUX',
  'Malaysia': 'MYS', 'Malta': 'MLT', 'Mexico': 'MEX', 'Myanmar': 'MMR', 'Hà Lan': 'NLD', 'New Zealand': 'NZL',
  'Na Uy': 'NOR', 'Pakistan': 'PAK', 'Peru': 'PER', 'Philippines': 'PHL', 'Bồ Đào Nha': 'PRT', 'Romania': 'ROU',
  'Nga': 'RUS', 'Saudi Arabia': 'SAU', 'Senegal': 'SEN', 'Singapore': 'SGP', 'Slovakia': 'SVK', 'Slovenia': 'SVN',
  'Nam Phi': 'ZAF', 'Hàn Quốc': 'KOR', 'Tây Ban Nha': 'ESP', 'Thụy Điển': 'SWE', 'Thụy Sỹ': 'CHE', 'Đài Loan': 'TWN',
  'Thái Lan': 'THA', 'Đông Timor': 'TLS', 'Thổ Nhĩ Kỳ': 'TUR', 'U-crai-na': 'UKR', 'Các Tiểu vương quốc Ả Rập Thống nhất': 'ARE',
  'Vương quốc Anh': 'GBR', 'Mỹ': 'USA',
};

const ISO_ALIASES = {
  'Bun-ga-ri': 'BGR', 'Crô-a-ti-a': 'HRV', 'Ê-xtô-ni-a': 'EST', 'Hung-ga-ri': 'HUN', 'I-ta-li-a': 'ITA',
  'Lát-vi-a': 'LVA', 'Lít-va': 'LTU', 'Lúc-xam-bua': 'LUX', 'Man-ta': 'MLT', 'Ru-ma-ni': 'ROU', 'Séc': 'CZE',
  'Síp': 'CYP', 'Xlô-va-ki-a': 'SVK', 'Xlô-ven-ni-a': 'SVN', 'Bru-nây': 'BRN', 'Cam-pu-chia': 'KHM',
  'In-đô-nê-xi-a': 'IDN', 'Ma-lai-xi-a': 'MYS', 'Mi-an-ma': 'MMR', 'Phi-li-pin': 'PHL', 'Xin-ga-po': 'SGP',
  'Ác-hen-ti-na': 'ARG', 'A-rập Xê-út': 'SAU', 'Cốt-đi-voa': 'CIV', 'Bra-xin': 'BRA', 'Tiểu VQ A-rập Thống nhất': 'ARE',
  'Ka-dắc-xtan': 'KAZ', 'Ca-na-đa': 'CAN', 'Chi-lê': 'CHL', 'Cô-oét': 'KWT', 'I-xra-en': 'ISR', 'Mê-hi-cô': 'MEX',
  'Niu Di-lân': 'NZL', 'Liên Bang Nga': 'RUS', 'Ô-xtrây-li-a': 'AUS', 'Pa-ki-xtan': 'PAK', 'Pê-ru': 'PER',
  'Thụy Sĩ': 'CHE', 'CHND Trung Hoa': 'CHN', 'Xênêgan': 'SEN', 'Ðặc khu HC Hồng Công (TQ)': 'HKG', 'U-crai-na': 'UKR',
};

const PRODUCT_HS = {
  'Cà phê': '0901', 'Cao su': '4001', 'Chè': '0902', 'Gạo': '1006', 'Gỗ và sản phẩm gỗ': '44', 'Giầy dép các loại': '64',
  'Hàng dệt may': '61', 'Hàng rau quả': '08', 'Hải sản': '03', 'Hạt điều': '0801', 'Hạt tiêu': '0904',
  'Sắn và các sản phẩm từ sắn': '07', 'Sản phẩm mây, tre, cói và thảm': '46', 'Sản phẩm từ cao su': '40', 'Sản phẩm từ chất dẻo': '39',
  'Điện thoại các loại và linh kiện': '8517', 'Bánh kẹo và các sản phẩm từ ngũ cốc': '19', 'Các sản phẩm hóa chất': '38',
  'Chất dẻo nguyên liệu': '39', 'Clanhke và xi măng': '2523', 'Dây điện và dây cáp điện': '8544', 'Dầu thô': '2709',
  'Đồ chơi, dụng cụ thể thao và bộ phận': '95', 'Giấy và các sản phẩm từ giấy': '48', 'Hóa chất': '28', 'Máy ảnh, máy quay phim và linh kiện': '90',
  'Máy móc thiết bị dụng cụ phụ tùng khác': '84', 'Máy vi tính và linh kiện': '8471', 'Nguyên phụ liệu dệt, may, da, giầy': '63',
  'Phân bón các loại': '31', 'Phương tiện vận tải và phụ tùng': '87', 'Quặng và khoáng sản khác': '26', 'Sản phẩm gốm sứ': '69',
  'Sản phẩm nội thất từ chất liệu khác gỗ': '94', 'Sản phẩm từ sắt thép': '73', 'Sắt thép các loại': '72', 'Than đá': '2701',
  'Thủy tinh và các sản phẩm từ thủy tinh': '70', 'Thức ăn gia súc và nguyên liệu': '23', 'Túi xách, ví, vaili, mũ & ô dù': '42',
  'Vải mành, vải kỹ thuật khác': '59', 'Xăng dầu các loại': '2710', 'Xơ, sợi dệt các loại': '55',
};

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const number = (value) => {
  const text = clean(value).replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
};
const normalizeName = (name) => clean(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ISO_NORMALIZED = new Map([...Object.entries(ISO), ...Object.entries(ISO_ALIASES)].map(([name, code]) => [normalizeName(name), code]));
const countryIso = (name) => ISO_NORMALIZED.get(normalizeName(name)) || null;
const COUNTRY_NAME = {
  ARG: 'Argentina', AUS: 'Australia', AUT: 'Austria', BEL: 'Belgium', BRA: 'Brazil', BRN: 'Brunei', BGR: 'Bulgaria', KHM: 'Cambodia', CAN: 'Canada', CHL: 'Chile', CHN: 'China', CIV: 'Cote d’Ivoire', HRV: 'Croatia', CYP: 'Cyprus', CZE: 'Czechia', DNK: 'Denmark', EST: 'Estonia', FIN: 'Finland', FRA: 'France', DEU: 'Germany', GRC: 'Greece', HKG: 'Hong Kong', HUN: 'Hungary', IND: 'India', IDN: 'Indonesia', IRL: 'Ireland', ISR: 'Israel', ITA: 'Italy', JPN: 'Japan', KAZ: 'Kazakhstan', KWT: 'Kuwait', LAO: 'Laos', LVA: 'Latvia', LTU: 'Lithuania', LUX: 'Luxembourg', MYS: 'Malaysia', MLT: 'Malta', MEX: 'Mexico', MMR: 'Myanmar', NLD: 'Netherlands', NZL: 'New Zealand', NOR: 'Norway', PAK: 'Pakistan', PER: 'Peru', PHL: 'Philippines', POL: 'Poland', PRT: 'Portugal', ROU: 'Romania', RUS: 'Russia', SAU: 'Saudi Arabia', SEN: 'Senegal', SGP: 'Singapore', SVK: 'Slovakia', SVN: 'Slovenia', ZAF: 'South Africa', KOR: 'South Korea', ESP: 'Spain', SWE: 'Sweden', CHE: 'Switzerland', TWN: 'Taiwan', THA: 'Thailand', TLS: 'Timor-Leste', TUR: 'Turkey', UKR: 'Ukraine', ARE: 'United Arab Emirates', GBR: 'United Kingdom', USA: 'United States',
};
const canonicalName = (name, iso) => COUNTRY_NAME[iso] || clean(name);

function periodFromRows(rows, fallback = '') {
  const title = clean(rows[0]?.[0]);
  const year = title.match(/(20\d{2})/)?.[1];
  const month = rows.flat().map(clean).find((x) => /^\d+\s+Tháng$/i.test(x))?.match(/\d+/)?.[0];
  return fallback || (year && month ? `${year}-${month.padStart(2, '0')}` : year || '');
}

export function readGsoXls(buffer, { kind = 'product', period = '', sourceUrl = '' } = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null, raw: false });
  const resolvedPeriod = period || periodFromRows(rows);
  const result = [];
  if (kind === 'total') {
    for (const row of rows.slice(6)) {
      const name = clean(row?.[1] || row?.[0]);
      const iso = countryIso(name);
      const value = number(row?.[18]);
      if (iso && value !== null) result.push({ period: resolvedPeriod, partner_iso: iso, partner_name: canonicalName(name, iso), hs_code: 'TOTAL', product_group: 'Tổng tất cả mặt hàng', export_value_usd: value * 1000, quantity_unit: '1000 USD', source_url: sourceUrl });
    }
  } else {
    let product = '';
    for (const row of rows.slice(5)) {
      if (row?.[0] && !row?.[1]) product = clean(row[0]);
      const name = clean(row?.[1]);
      const iso = countryIso(name);
      const hs = PRODUCT_HS[product];
      const value = number(row?.[19]);
      if (hs && iso && value !== null) result.push({ period: resolvedPeriod, partner_iso: iso, partner_name: canonicalName(name, iso), hs_code: hs, product_group: product, export_value_usd: value * 1000, quantity_unit: '1000 USD', source_url: sourceUrl });
    }
  }
  if (!result.length) throw new Error(`Không đọc được dòng dữ liệu hợp lệ từ XLS (${kind})`);
  return result;
}

export function discoverGsoFile(html, kind) {
  const links = [...String(html).matchAll(/https?:[^"'<>\s]+\.xls/gi)].map((match) => match[0].replace(/&amp;/g, '&'));
  const pattern = kind === 'total' ? /\/V03-20\d{2}-[^/]+\.xls$/i : /\/V06-20\d{2}-[^/]+\.xls$/i;
  return links.find((link) => pattern.test(link)) || null;
}
