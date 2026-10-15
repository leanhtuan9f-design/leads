import { ScrapedBusiness, ScraperOptions } from '../types/scraper';

export interface ProgressCallbackData {
  scrapedCount: number;
  totalFound: number;
  currentQuery: string;
  currentBusinessTitle?: string;
  speedPerMin: number;
  statusMessage: string;
  newPlace?: ScrapedBusiness;
  skippedDuplicates?: number;
  marketEstimatedTotal?: number;
  marketCoveragePercent?: number;
  isMarketExhausted?: boolean;
  guaranteedQuotaTarget?: number;
  guaranteedQuotaCurrent?: number;
  currentSubdivision?: string;
}

export interface AdministrativeDistrict {
  name: string;
  streets: string[];
  lat: number;
  lon: number;
}

// Dynamic Multi-Region Subdivisions (Hà Nội, TP.HCM, Đà Nẵng, Cần Thơ, Hải Phòng, Bình Dương, etc.)
const KNOWN_REGION_SUBDIVISIONS: Record<string, AdministrativeDistrict[]> = {
  hanoi: [
    { name: 'Quận Cầu Giấy', streets: ['Cầu Giấy', 'Xuân Thủy', 'Duy Tân', 'Trần Thái Tông', 'Trung Kính', 'Nguyễn Phong Sắc'], lat: 21.0362, lon: 105.7905 },
    { name: 'Quận Đống Đa', streets: ['Xã Đàn', 'Chùa Bộc', 'Thái Hà', 'Tôn Đức Thắng', 'Láng Hạ', 'Tây Sơn'], lat: 21.0180, lon: 105.8290 },
    { name: 'Quận Ba Đình', streets: ['Kim Mã', 'Liễu Giai', 'Đội Cấn', 'Giảng Võ', 'Nguyễn Chí Thanh'], lat: 21.0341, lon: 105.8242 },
    { name: 'Quận Thanh Xuân', streets: ['Nguyễn Trãi', 'Lê Văn Lương', 'Khuất Duy Tiến', 'Vũ Tông Phan', 'Ngụy Như Kon Tum'], lat: 20.9936, lon: 105.8083 },
    { name: 'Quận Hai Bà Trưng', streets: ['Bạch Mai', 'Phố Huế', 'Đại Cồ Việt', 'Minh Khai', 'Lạc Trung', 'Bà Triệu'], lat: 21.0084, lon: 105.8525 },
    { name: 'Quận Hoàn Kiếm', streets: ['Tràng Tiền', 'Hàng Bài', 'Lý Thường Kiệt', 'Hai Bà Trưng', 'Hàng Bông'], lat: 21.0285, lon: 105.8542 },
    { name: 'Quận Hà Đông', streets: ['Quang Trung', 'Trần Phú', 'Vạn Phúc', 'Tố Hữu', 'Lê Trọng Tấn'], lat: 20.9721, lon: 105.7766 },
    { name: 'Quận Nam Từ Liêm', streets: ['Mễ Trì', 'Lê Đức Thọ', 'Phạm Hùng', 'Hàm Nghi', 'Đỗ Đức Dục'], lat: 21.0152, lon: 105.7656 },
    { name: 'Quận Bắc Từ Liêm', streets: ['Hoàng Quốc Việt', 'Cổ Nhuế', 'Phạm Văn Đồng', 'Xuân Đỉnh'], lat: 21.0632, lon: 105.7628 },
    { name: 'Quận Tây Hồ', streets: ['Lạc Long Quân', 'Âu Cơ', 'Xuân Diệu', 'Thụy Khuê', 'Võ Chí Công'], lat: 21.0583, lon: 105.8239 },
    { name: 'Quận Hoàng Mai', streets: ['Giải Phóng', 'Tam Trinh', 'Định Công', 'Linh Đàm', 'Trương Định'], lat: 20.9782, lon: 105.8453 },
    { name: 'Quận Long Biên', streets: ['Nguyễn Văn Cừ', 'Ngọc Lâm', 'Việt Hưng', 'Ngô Gia Tự'], lat: 21.0487, lon: 105.8890 }
  ],
  hcm: [
    { name: 'Quận 1', streets: ['Nguyễn Huệ', 'Lê Lợi', 'Đồng Khởi', 'Hai Bà Trưng', 'Pasteur'], lat: 10.7769, lon: 106.7009 },
    { name: 'Quận 3', streets: ['Võ Văn Tần', 'Nguyễn Thị Minh Khai', 'Cách Mạng Tháng 8', 'Lý Chính Thắng'], lat: 10.7843, lon: 106.6843 },
    { name: 'Quận Bình Thạnh', streets: ['Điện Biên Phủ', 'Xô Viết Nghệ Tĩnh', 'Phan Đăng Lưu', 'Bạch Đằng'], lat: 10.8105, lon: 106.7091 },
    { name: 'Quận 7', streets: ['Nguyễn Thị Thập', 'Nguyễn Văn Linh', 'Huỳnh Tấn Phát', 'Lê Văn Lương'], lat: 10.7340, lon: 106.7218 },
    { name: 'Quận Tân Bình', streets: ['Cộng Hòa', 'Hoàng Văn Thụ', 'Trường Chinh', 'Lê Văn Sỹ'], lat: 10.8015, lon: 106.6526 },
    { name: 'TP. Thủ Đức', streets: ['Võ Văn Ngân', 'Đỗ Xuân Hợp', 'Lê Văn Việt', 'Xa Lộ Hà Nội'], lat: 10.8494, lon: 106.7537 },
    { name: 'Quận 10', streets: ['Ba Tháng Hai', 'Tô Hiến Thành', 'Lý Thái Tổ', 'Thành Thái'], lat: 10.7735, lon: 106.6678 },
    { name: 'Quận Phú Nhuận', streets: ['Phan Xích Long', 'Nguyễn Kiệm', 'Hoàng Văn Thụ'], lat: 10.7992, lon: 106.6803 },
    { name: 'Quận Gò Vấp', streets: ['Quang Trung', 'Phan Văn Trị', 'Nguyễn Oanh', 'Lê Đức Thọ'], lat: 10.8388, lon: 106.6653 },
    { name: 'Quận 5', streets: ['Trần Hưng Đạo', 'An Dương Vương', 'Nguyễn Trãi', 'Hồng Bàng'], lat: 10.7540, lon: 106.6634 },
    { name: 'Quận Tân Phú', streets: ['Lũy Bán Bích', 'Thoại Ngọc Hầu', 'Tân Kỳ Tân Quý'], lat: 10.7925, lon: 106.6283 },
    { name: 'Quận Bình Tân', streets: ['Kinh Dương Vương', 'Tên Lửa', 'Mã Lò', 'Hương Lộ 2'], lat: 10.7652, lon: 106.6039 }
  ],
  danang: [
    { name: 'Quận Hải Châu', streets: ['Bạch Đằng', 'Trần Phú', 'Lê Duẩn', 'Nguyễn Văn Linh', 'Hùng Vương'], lat: 16.0684, lon: 108.2208 },
    { name: 'Quận Thanh Khê', streets: ['Điện Biên Phủ', 'Hà Huy Tập', 'Nguyễn Tất Thành', 'Trần Cao Vân'], lat: 16.0620, lon: 108.1882 },
    { name: 'Quận Sơn Trà', streets: ['Võ Nguyên Giáp', 'Phạm Văn Đồng', 'Ngô Quyền', 'Hoàng Sa'], lat: 16.0825, lon: 108.2435 },
    { name: 'Quận Ngũ Hành Sơn', streets: ['Lê Văn Hiến', 'Trường Sa', 'Võ Chí Công'], lat: 16.0123, lon: 108.2581 },
    { name: 'Quận Cẩm Lệ', streets: ['Cách Mạng Tháng 8', 'Nguyễn Hữu Thọ', 'Trường Chinh'], lat: 15.9982, lon: 108.2045 },
    { name: 'Quận Liên Chiểu', streets: ['Tôn Đức Thắng', 'Nguyễn Lương Bằng', 'Kinh Dương Vương'], lat: 16.0789, lon: 108.1486 }
  ],
  haiphong: [
    { name: 'Quận Hồng Bàng', streets: ['Điện Biên Phủ', 'Quang Trung', 'Trần Hưng Đạo', 'Hoàng Văn Thụ'], lat: 20.8651, lon: 106.6838 },
    { name: 'Quận Ngô Quyền', streets: ['Lạch Tray', 'Lê Lợi', 'Đà Nẵng', 'Trần Phú'], lat: 20.8528, lon: 106.6987 },
    { name: 'Quận Lê Chân', streets: ['Tô Hiệu', 'Trần Nguyên Hãn', 'Mê Linh', 'Nguyễn Đức Cảnh'], lat: 20.8492, lon: 106.6749 },
    { name: 'Quận Hải An', streets: ['Lê Hồng Phong', 'Nguyễn Bỉnh Khiêm', 'Đặng Vũ Hỷ'], lat: 20.8385, lon: 106.7262 },
    { name: 'Quận Kiến An', streets: ['Trần Thành Ngọ', 'Trần Tất Văn', 'Phan Đăng Lưu'], lat: 20.8062, lon: 106.6321 }
  ],
  cantho: [
    { name: 'Quận Ninh Kiều', streets: ['Hai Bà Trưng', '30 Tháng 4', 'Đại lộ Hòa Bình', 'Nguyễn Trãi', 'Trần Hưng Đạo'], lat: 10.0342, lon: 105.7876 },
    { name: 'Quận Cái Răng', streets: ['Quang Trung', 'Lê Hồng Nhi', 'Phạm Hùng'], lat: 10.0019, lon: 105.7725 },
    { name: 'Quận Bình Thủy', streets: ['Cách Mạng Tháng 8', 'Lê Hồng Phong', 'Nguyễn Thông'], lat: 10.0712, lon: 105.7381 },
    { name: 'Quận Ô Môn', streets: ['Quốc lộ 91', 'Trần Hưng Đạo', 'Lê Lợi'], lat: 10.1245, lon: 105.6284 }
  ],
  binhduong: [
    { name: 'TP. Thủ Dầu Một', streets: ['Yersin', 'Đại lộ Bình Dương', 'Thích Quảng Đức', 'Lê Hồng Phong'], lat: 10.9804, lon: 106.6519 },
    { name: 'TP. Thuận An', streets: ['Nguyễn Trãi', 'Độc Lập', 'Gia Long', 'Cách Mạng Tháng 8'], lat: 10.9205, lon: 106.7028 },
    { name: 'TP. Dĩ An', streets: ['Trần Hưng Đạo', 'Lý Thường Kiệt', 'Nguyễn An Ninh'], lat: 10.9042, lon: 106.7681 },
    { name: 'TP. Bến Cát', streets: ['Hùng Vương', '30 Tháng 4', 'Quốc lộ 13'], lat: 11.1341, lon: 106.6115 }
  ]
};

// Export fallback constant for backwards compatibility
export const HANOI_DISTRICTS = KNOWN_REGION_SUBDIVISIONS['hanoi'];
export const HCM_DISTRICTS = KNOWN_REGION_SUBDIVISIONS['hcm'];

// Trả về danh sách quận/huyện THẬT của thành phố đã biết (null nếu không có) — dùng để tách truy vấn Google Maps
export function getKnownDistricts(location: string): AdministrativeDistrict[] | null {
  const n = location.toLowerCase().trim();
  if (/hà nội|hanoi/i.test(n)) return KNOWN_REGION_SUBDIVISIONS['hanoi'];
  if (/hcm|tp\.hcm|sài gòn|saigon|hồ chí minh/i.test(n)) return KNOWN_REGION_SUBDIVISIONS['hcm'];
  if (/đà nẵng|da nang/i.test(n)) return KNOWN_REGION_SUBDIVISIONS['danang'];
  if (/hải phòng|hai phong/i.test(n)) return KNOWN_REGION_SUBDIVISIONS['haiphong'];
  if (/cần thơ|can tho/i.test(n)) return KNOWN_REGION_SUBDIVISIONS['cantho'];
  if (/bình dương|binh duong/i.test(n)) return KNOWN_REGION_SUBDIVISIONS['binhduong'];
  return null;
}

// Universal dynamic spatial subdivision generator for ANY location on Earth
export function getDynamicSubdivisions(location: string, customLat?: number, customLon?: number): AdministrativeDistrict[] {
  const normLoc = location.toLowerCase().trim();

  // 1. Match known metropolis
  if (/hà nội|hanoi/i.test(normLoc)) return KNOWN_REGION_SUBDIVISIONS['hanoi'];
  if (/hcm|tp\.hcm|sài gòn|saigon|hồ chí minh/i.test(normLoc)) return KNOWN_REGION_SUBDIVISIONS['hcm'];
  if (/đà nẵng|da nang/i.test(normLoc)) return KNOWN_REGION_SUBDIVISIONS['danang'];
  if (/hải phòng|hai phong/i.test(normLoc)) return KNOWN_REGION_SUBDIVISIONS['haiphong'];
  if (/cần thơ|can tho/i.test(normLoc)) return KNOWN_REGION_SUBDIVISIONS['cantho'];
  if (/bình dương|binh duong/i.test(normLoc)) return KNOWN_REGION_SUBDIVISIONS['binhduong'];

  // 2. Dynamic Spatial 9-Quadrant Coordinate Grid Subdivision for ANY city/province/GPS coordinates
  const baseLat = customLat ?? 21.0285;
  const baseLon = customLon ?? 105.8542;

  const isVietnam = /việt nam|vietnam|\.vn/i.test(normLoc) || customLat === undefined || (customLat > 8 && customLat < 24 && customLon && customLon > 102 && customLon < 110);

  const quadrants = [
    { name: `${location} - Khu Trung tâm (Center Core)`, dLat: 0, dLon: 0 },
    { name: `${location} - Phân khu Bắc (North)`, dLat: 0.025, dLon: 0 },
    { name: `${location} - Phân khu Nam (South)`, dLat: -0.025, dLon: 0 },
    { name: `${location} - Phân khu Đông (East)`, dLat: 0, dLon: 0.025 },
    { name: `${location} - Phân khu Tây (West)`, dLat: 0, dLon: -0.025 },
    { name: `${location} - Phân khu Đông Bắc (NE)`, dLat: 0.02, dLon: 0.02 },
    { name: `${location} - Phân khu Tây Bắc (NW)`, dLat: 0.02, dLon: -0.02 },
    { name: `${location} - Phân khu Đông Nam (SE)`, dLat: -0.02, dLon: 0.02 },
    { name: `${location} - Phân khu Tây Nam (SW)`, dLat: -0.02, dLon: -0.02 }
  ];

  const vnStreets = ['Trần Hưng Đạo', 'Lê Lợi', 'Nguyễn Huệ', 'Quang Trung', 'Hai Bà Trưng', 'Phan Chu Trinh', 'Điện Biên Phủ', 'Hùng Vương', 'Nguyễn Trãi', 'Lý Thường Kiệt'];
  const usStreets = ['Main St', 'Market St', 'Broadway', 'Oak Ave', 'Grand Ave', 'Commerce Pkwy', 'Center Blvd', 'Pine St'];

  return quadrants.map((q, idx) => ({
    name: q.name,
    streets: isVietnam 
      ? [vnStreets[idx % vnStreets.length], vnStreets[(idx + 3) % vnStreets.length], vnStreets[(idx + 6) % vnStreets.length]]
      : [usStreets[idx % usStreets.length], usStreets[(idx + 2) % usStreets.length]],
    lat: baseLat + q.dLat,
    lon: baseLon + q.dLon
  }));
}

// Estimate dynamic market total business listings for ANY category & city
export function estimateMarketTotal(category: string, city: string): number {
  const normCat = category.toLowerCase().trim();
  const normCity = city.toLowerCase().trim();

  // Population Tier
  const isMetropolis = /hà nội|hanoi|tp\.hcm|hcm|sài gòn|saigon|new york|chicago|london|tokyo|los angeles/i.test(normCity);
  const isMajorProvincial = /đà nẵng|hải phòng|cần thơ|bình dương|đồng nai|nha trang|vũng tàu|quảng ninh/i.test(normCity);

  let categoryMultiplier = 1.0;
  if (/cà phê|cafe|quán|nhà hàng|food|ăn uống|tạp hóa/i.test(normCat)) {
    categoryMultiplier = 2.4; // Very high density
  } else if (/spa|làm đẹp|salon|nha khoa|phòng khám|khách sạn|hotel/i.test(normCat)) {
    categoryMultiplier = 1.3; // Medium-high density
  } else if (/xây dựng|luật|kế toán|gara|marketing|agency|công nghệ/i.test(normCat)) {
    categoryMultiplier = 0.9; // Professional B2B density
  } else {
    categoryMultiplier = 1.0;
  }

  let baseCount = isMetropolis ? 100 : (isMajorProvincial ? 65 : 35);
  const estimated = Math.round(baseCount * categoryMultiplier);

  return Math.max(25, Math.min(350, estimated));
}

// Calculate lead score based on contactability and agency/B2B outreach opportunity
export function calculateLeadScore(biz: Partial<ScrapedBusiness>): { score: number; status: 'hot' | 'warm' | 'cold' } {
  let score = 50;

  if (biz.phone) score += 15;
  if (biz.website) score += 15;
  if (biz.email) score += 15;
  if (biz.socials && Object.keys(biz.socials).length > 0) score += 5;

  if ((biz.reviewsCount || 0) > 50) score += 5;
  if ((biz.rating || 0) >= 4.5) score += 5;
  if (!biz.isClaimed) score += 10;

  score = Math.min(100, Math.max(10, score));

  let status: 'hot' | 'warm' | 'cold' = 'cold';
  if (score >= 85) status = 'hot';
  else if (score >= 65) status = 'warm';

  return { score, status };
}

// Parse query to identify category and location dynamically
function parseQuery(options: ScraperOptions): { category: string; city: string; state: string; customLat?: number; customLon?: number } {
  let category = options.category?.trim() || '';
  let location = options.location?.trim() || '';

  const coordMatch = location.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
  let customLat: number | undefined;
  let customLon: number | undefined;

  if (coordMatch) {
    customLat = parseFloat(coordMatch[1]);
    customLon = parseFloat(coordMatch[3]);
    location = `Tọa độ (${customLat.toFixed(4)}, ${customLon.toFixed(4)})`;
  }

  if (!category || !location) {
    const rawQuery = options.query || '';
    const parts = rawQuery.toLowerCase().split(/\stại\s|\sở\s|\sin\s|\snear\s|,/i);
    if (!category) {
      category = parts.length >= 2 ? parts[0].trim() : rawQuery.trim();
    }
    if (!location) {
      location = parts.length >= 2 ? parts[1].trim() : 'Hà Nội';
    }
  }

  category = category.replace(/\b\w/g, c => c.toUpperCase()) || 'Doanh nghiệp';
  location = location.replace(/\b\w/g, c => c.toUpperCase()) || 'Hà Nội';

  return { category, city: location, state: 'VN', customLat, customLon };
}

// ===== Engine cào THẬT: gọi backend /api/jobs (gosom/google-maps-scraper chạy trong Docker) =====
const API_BASE = '/api';
const MAX_JOB_RESULTS = 300;
const MAX_DISTRICT_QUERIES = 12;

const dedupeKeys = (b: Pick<ScrapedBusiness, 'title' | 'phone' | 'placeId'>): string[] => {
  const keys: string[] = [];
  if (b.placeId) keys.push(b.placeId);
  if (b.title) keys.push(b.title.toLowerCase().trim());
  const phone = (b.phone || '').replace(/\D/g, '');
  if (phone) keys.push(phone);
  return keys;
};

export async function executeScrapingJob(
  options: ScraperOptions,
  onProgress: (data: ProgressCallbackData) => void,
  isCancelled: () => boolean
): Promise<ScrapedBusiness[]> {
  const startTime = Date.now();
  const { category, city, customLat, customLon } = parseQuery(options);
  const marketEstimatedTotal = estimateMarketTotal(category, city);
  const isExhaustive = options.scrapeMode === 'exhaustive';
  const targetCount = Math.min(
    MAX_JOB_RESULTS,
    isExhaustive ? Math.max(options.maxResults || 0, marketEstimatedTotal) : (options.maxResults || 25)
  );
  const effectiveQuery = options.query || `${category} tại ${city}`;

  const existingKeySet = new Set<string>();
  (options.existingBusinesses || []).forEach(b => dedupeKeys(b).forEach(k => existingKeySet.add(k)));
  const existingCountInDb = options.existingBusinesses?.length || 0;

  // Dựng danh sách truy vấn: tách theo quận để vượt giới hạn ~120 kết quả/truy vấn của Google Maps
  let queries: string[];
  let geo: string | undefined;
  if (customLat !== undefined && customLon !== undefined) {
    queries = [category];
    geo = `${customLat},${customLon}`;
  } else {
    const districts = getKnownDistricts(city);
    if (options.useDistrictSubdivision !== false && districts) {
      const wanted = options.selectedDistricts?.length
        ? districts.filter(d => options.selectedDistricts!.includes(d.name))
        : districts;
      const need = isExhaustive ? MAX_DISTRICT_QUERIES : Math.max(1, Math.ceil(targetCount / 20));
      queries = wanted.slice(0, Math.min(MAX_DISTRICT_QUERIES, need)).map(d => `${category} ${d.name}, ${city}`);
    } else {
      queries = [`${category} ${city}`];
    }
  }

  onProgress({
    scrapedCount: 0,
    totalFound: targetCount,
    currentQuery: effectiveQuery,
    speedPerMin: 0,
    skippedDuplicates: 0,
    marketEstimatedTotal,
    marketCoveragePercent: Math.min(100, Math.round((existingCountInDb / marketEstimatedTotal) * 100)),
    guaranteedQuotaTarget: targetCount,
    guaranteedQuotaCurrent: 0,
    statusMessage: `Đang gửi yêu cầu tới engine Google Maps (${queries.length} truy vấn)...`
  });

  const resp = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries,
      geo,
      maxResults: targetCount,
      extractEmails: options.extractEmails,
      lang: options.language || 'vi',
      proxies: options.proxies && options.proxies.length ? options.proxies : undefined
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Engine trả lỗi ${resp.status}`);
  }
  const { id: jobId } = await resp.json();

  const results: ScrapedBusiness[] = [];
  let skippedDuplicatesCount = 0;
  let endedNaturally = false;

  await new Promise<void>((resolve, reject) => {
    const es = new EventSource(`${API_BASE}/jobs/${jobId}/events`);
    let settled = false;

    const stop = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(cancelTimer);
      es.close();
      fetch(`${API_BASE}/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {});
      err ? reject(err) : resolve();
    };

    const cancelTimer = setInterval(() => { if (isCancelled()) stop(); }, 500);

    es.addEventListener('status', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      if (d.status === 'queued') {
        onProgress({
          scrapedCount: results.length, totalFound: targetCount, currentQuery: effectiveQuery, speedPerMin: 0,
          statusMessage: `Đang xếp hàng chờ engine (vị trí ${d.position ?? 1})...`
        });
      } else if (d.message) {
        onProgress({
          scrapedCount: results.length, totalFound: targetCount, currentQuery: effectiveQuery, speedPerMin: 0,
          statusMessage: d.message
        });
      }
    });

    es.addEventListener('place', (e) => {
      const raw = JSON.parse((e as MessageEvent).data) as ScrapedBusiness;
      if ((options.skipWithoutPhone && !raw.phone) || (options.skipWithoutWebsite && !raw.website)) return;
      const keys = dedupeKeys(raw);
      const elapsedMin = Math.max((Date.now() - startTime) / 60000, 1 / 60);

      if (keys.some(k => existingKeySet.has(k))) {
        skippedDuplicatesCount++;
        onProgress({
          scrapedCount: results.length, totalFound: targetCount, currentQuery: effectiveQuery,
          speedPerMin: Math.round(results.length / elapsedMin),
          skippedDuplicates: skippedDuplicatesCount, marketEstimatedTotal,
          guaranteedQuotaTarget: targetCount, guaranteedQuotaCurrent: results.length,
          statusMessage: `Bỏ qua cơ sở đã có: "${raw.title}" (${skippedDuplicatesCount} đã bỏ qua)`
        });
        return;
      }
      keys.forEach(k => existingKeySet.add(k));

      const { score, status } = calculateLeadScore(raw);
      const business: ScrapedBusiness = { ...raw, leadScore: score, leadStatus: status };
      results.push(business);

      const totalInMarket = existingCountInDb + results.length;
      onProgress({
        scrapedCount: results.length, totalFound: targetCount, currentQuery: effectiveQuery,
        currentBusinessTitle: business.title,
        speedPerMin: Math.round(results.length / elapsedMin),
        skippedDuplicates: skippedDuplicatesCount, marketEstimatedTotal,
        marketCoveragePercent: Math.min(100, Math.round((totalInMarket / marketEstimatedTotal) * 100)),
        isMarketExhausted: false,
        guaranteedQuotaTarget: targetCount, guaranteedQuotaCurrent: results.length,
        statusMessage: `[${results.length}/${targetCount}] ${business.title}`,
        newPlace: business
      });

      if (results.length >= targetCount) stop();
    });

    es.addEventListener('end', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      if (d.status === 'failed' && results.length === 0) {
        return stop(new Error(d.message || 'Engine cào thất bại'));
      }
      endedNaturally = d.status === 'done';
      stop();
    });

    es.onerror = () => {
      // EventSource tự nối lại; chỉ coi là lỗi nếu server đóng hẳn mà chưa có kết quả
      if (es.readyState === EventSource.CLOSED && !settled) {
        stop(results.length > 0 ? undefined : new Error('Mất kết nối tới engine'));
      }
    };
  });

  // Chế độ quét cạn: engine tự kết thúc trước khi đủ chỉ tiêu nghĩa là các truy vấn đã hết kết quả
  if (isExhaustive && endedNaturally && results.length < targetCount) {
    const total = existingCountInDb + results.length;
    onProgress({
      scrapedCount: results.length, totalFound: targetCount, currentQuery: effectiveQuery, speedPerMin: 0,
      skippedDuplicates: skippedDuplicatesCount,
      marketEstimatedTotal: Math.max(marketEstimatedTotal, total),
      marketCoveragePercent: 100,
      isMarketExhausted: true,
      statusMessage: `Đã cào hết kết quả Google Maps cho "${effectiveQuery}" (${total} cơ sở).`
    });
  }

  return results;
}
