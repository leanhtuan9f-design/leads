import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const CITY_DATA = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'cities.json'), 'utf8'));

// Bộ từ khóa cục bộ giúp truy xuất nhanh trước khi gọi AI. Mã HS chỉ là ứng viên;
// không coi đây là phân loại hải quan cuối cùng nếu người dùng chưa xác nhận.
const PRODUCT_HINTS = [
  { pattern: /cà phê|coffee/i, hs: ['0901'], name: 'Cà phê' },
  { pattern: /hạt điều|cashew/i, hs: ['0801'], name: 'Hạt điều' },
  { pattern: /gạo|rice/i, hs: ['1006'], name: 'Gạo' },
  { pattern: /hồ tiêu|tiêu đen|pepper/i, hs: ['0904'], name: 'Hồ tiêu' },
  { pattern: /cao su|rubber/i, hs: ['4001'], name: 'Cao su' },
  { pattern: /thủy sản|hải sản|tôm|cá tra|seafood|shrimp/i, hs: ['0306', '0304'], name: 'Thủy sản' },
  { pattern: /dệt may|quần áo|may mặc|textile|garment/i, hs: ['61', '62'], name: 'Dệt may' },
  { pattern: /giày dép|footwear|shoes/i, hs: ['64'], name: 'Giày dép' },
  { pattern: /đồ gỗ|gỗ|wood|furniture/i, hs: ['44', '9403'], name: 'Gỗ và đồ gỗ' },
  { pattern: /trái cây|hoa quả|fruit/i, hs: ['08'], name: 'Trái cây' },
  { pattern: /chè|trà|tea/i, hs: ['0902'], name: 'Chè' },
  { pattern: /bánh kẹo|kẹo|candy|confectionery/i, hs: ['1704', '1905'], name: 'Bánh kẹo' },
  { pattern: /phân bón|fertilizer/i, hs: ['31'], name: 'Phân bón' },
  { pattern: /hóa chất|chemical/i, hs: ['28', '29', '38'], name: 'Hóa chất' },
  { pattern: /nhựa nguyên liệu|plastic resin/i, hs: ['39'], name: 'Chất dẻo nguyên liệu' },
  { pattern: /xi măng|clinker|cement/i, hs: ['2523'], name: 'Xi măng và clinker' },
  { pattern: /dầu thô|crude oil/i, hs: ['2709'], name: 'Dầu thô' },
  { pattern: /xăng dầu|petroleum/i, hs: ['2710'], name: 'Xăng dầu' },
  { pattern: /điện thoại|smartphone|mobile phone/i, hs: ['8517'], name: 'Điện thoại và linh kiện' },
  { pattern: /máy tính|computer/i, hs: ['8471'], name: 'Máy tính và linh kiện' },
  { pattern: /dây điện|electric cable/i, hs: ['8544'], name: 'Dây điện và cáp điện' },
  { pattern: /đồ chơi|toy/i, hs: ['95'], name: 'Đồ chơi' },
  { pattern: /túi xách|vali|handbag|luggage/i, hs: ['4202'], name: 'Túi xách và vali' },
  { pattern: /gốm sứ|ceramic/i, hs: ['69'], name: 'Gốm sứ' },
];

// Điểm logistics là metadata vận hành, không phải số liệu hải quan. Các thành phố
// trong bảng hiện có nhưng chưa được đánh dấu sẽ vẫn được trả về với điểm nền.
const LOGISTICS = {
  'United States': { hubs: { 'Los Angeles': 96, 'New York': 92, 'Houston': 88, 'Seattle': 86, 'Miami': 82, 'Chicago': 78, 'Dallas': 76, 'Atlanta': 74 }, reason: 'Cảng biển lớn và mạng hàng không/kho vận phát triển' },
  Japan: { hubs: { Tokyo: 94, Osaka: 96, Yokohama: 98, Nagoya: 93, Fukuoka: 84, Kobe: 95 }, reason: 'Cụm cảng Tokyo–Yokohama/Kansai và sân bay hàng hóa' },
  'South Korea': { hubs: { Busan: 98, Incheon: 94, Seoul: 88, Daegu: 76 }, reason: 'Busan là cảng trung chuyển; Incheon là đầu mối hàng không' },
  China: { hubs: { Shanghai: 99, Shenzhen: 97, Guangzhou: 95, Qingdao: 91, Beijing: 82 }, reason: 'Các cảng container và sân bay hàng hóa lớn' },
  Germany: { hubs: { Hamburg: 99, Frankfurt: 96, Bremen: 91, Berlin: 78, Düsseldorf: 84 }, reason: 'Hamburg là cảng biển; Frankfurt là trung tâm hàng không' },
  France: { hubs: { Marseille: 95, Paris: 94, 'Le Havre': 96, Lyon: 82 }, reason: 'Cảng Marseille/Le Havre và mạng logistics nội địa' },
  'United Kingdom': { hubs: { London: 92, Manchester: 88, Liverpool: 94, Birmingham: 82, Bristol: 86 }, reason: 'Cảng biển phía Tây/Nam và các trung tâm hàng không' },
  Netherlands: { hubs: { Rotterdam: 100, Amsterdam: 94, Eindhoven: 82 }, reason: 'Rotterdam là đầu mối cảng biển và logistics châu Âu' },
  Italy: { hubs: { Genoa: 96, Naples: 88, Milan: 91, Rome: 84 }, reason: 'Cảng Genoa/Naples và trung tâm phân phối miền Bắc' },
  Spain: { hubs: { Valencia: 96, Barcelona: 94, Madrid: 90, Bilbao: 88 }, reason: 'Cảng biển lớn kết hợp trung tâm hàng không Madrid' },
  Australia: { hubs: { Sydney: 94, Melbourne: 97, Brisbane: 89, Perth: 86 }, reason: 'Cảng biển và sân bay quốc tế của các đô thị lớn' },
  Canada: { hubs: { Vancouver: 98, Toronto: 94, Montreal: 92 }, reason: 'Vancouver là cửa ngõ Thái Bình Dương; Toronto là hub hàng không' },
  Singapore: { hubs: { Singapore: 100 }, reason: 'Cảng trung chuyển và sân bay hàng hóa hàng đầu khu vực' },
  Malaysia: { hubs: { 'Port Klang': 98, 'Kuala Lumpur': 91, Penang: 89 }, reason: 'Cụm Port Klang và sân bay Kuala Lumpur' },
  Thailand: { hubs: { Bangkok: 92, 'Laem Chabang': 99 }, reason: 'Cảng Laem Chabang và sân bay Bangkok' },
  India: { hubs: { Mumbai: 96, Delhi: 91, Chennai: 93, Kolkata: 88 }, reason: 'Cảng biển lớn và các hub hàng không nội địa' },
  'United Arab Emirates': { hubs: { Dubai: 99, 'Abu Dhabi': 93 }, reason: 'Cảng Jebel Ali và trung tâm hàng không trung chuyển' },
};

// Tọa độ và loại hub của các điểm ưu tiên. Dùng để giải thích và mở rộng sang
// khoảng cách ở bước sau; các điểm chưa có bản ghi vẫn chỉ nhận điểm nền.
const LOGISTICS_DETAILS = {
  'Yokohama': { lat: 35.4437, lon: 139.6380, port: 'Yokohama Port', airport: 'Narita/Haneda', source: 'curated-hub-metadata' },
  'Osaka': { lat: 34.6937, lon: 135.5023, port: 'Osaka Port', airport: 'Kansai International', source: 'curated-hub-metadata' },
  'Busan': { lat: 35.1796, lon: 129.0756, port: 'Busan Port', airport: 'Gimhae International', source: 'curated-hub-metadata' },
  'Shanghai': { lat: 31.2304, lon: 121.4737, port: 'Port of Shanghai', airport: 'Shanghai Pudong', source: 'curated-hub-metadata' },
  'Shenzhen': { lat: 22.5431, lon: 114.0579, port: 'Port of Shenzhen', airport: 'Shenzhen Bao’an', source: 'curated-hub-metadata' },
  'Hamburg': { lat: 53.5511, lon: 9.9937, port: 'Port of Hamburg', airport: 'Hamburg Airport', source: 'curated-hub-metadata' },
  'Rotterdam': { lat: 51.9244, lon: 4.4777, port: 'Port of Rotterdam', airport: 'Amsterdam Schiphol', source: 'curated-hub-metadata' },
  'Genoa': { lat: 44.4056, lon: 8.9463, port: 'Port of Genoa', airport: 'Genoa Airport', source: 'curated-hub-metadata' },
  'Valencia': { lat: 39.4699, lon: -0.3763, port: 'Port of Valencia', airport: 'Valencia Airport', source: 'curated-hub-metadata' },
  'Los Angeles': { lat: 34.0522, lon: -118.2437, port: 'Port of Los Angeles', airport: 'LAX', source: 'curated-hub-metadata' },
  'New York': { lat: 40.7128, lon: -74.0060, port: 'Port of New York/New Jersey', airport: 'JFK', source: 'curated-hub-metadata' },
  'Vancouver': { lat: 49.2827, lon: -123.1207, port: 'Port of Vancouver', airport: 'Vancouver International', source: 'curated-hub-metadata' },
  'Singapore': { lat: 1.3521, lon: 103.8198, port: 'Port of Singapore', airport: 'Changi', source: 'curated-hub-metadata' },
  'Mumbai': { lat: 19.0760, lon: 72.8777, port: 'Jawaharlal Nehru Port', airport: 'Mumbai International', source: 'curated-hub-metadata' },
  'Dubai': { lat: 25.2048, lon: 55.2708, port: 'Jebel Ali Port', airport: 'Dubai International', source: 'curated-hub-metadata' },
};

const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const countryName = (country) => Object.keys(CITY_DATA.cities).find((x) => normalize(x) === normalize(country))
  || Object.keys(CITY_DATA.cities).find((x) => normalize(x) === normalize(CITY_DATA.alias?.[normalize(country)] || '')) || country;

export function classifyProduct(product) {
  const hit = PRODUCT_HINTS.find((x) => x.pattern.test(String(product || '')));
  return hit ? { ...hit, confidence: 'medium', source: 'local-product-hints' } : { hs: [], name: '', confidence: 'low', source: 'unclassified' };
}

function cityRecommendations(country) {
  const name = countryName(country);
  const cities = CITY_DATA.cities[name] || [];
  const meta = LOGISTICS[name] || { hubs: {}, reason: 'Chưa có dữ liệu logistics chi tiết; dùng danh sách thành phố hiện có' };
  return cities.map((city, index) => ({
    city,
    logisticsScore: meta.hubs[city] || Math.max(55, 70 - index),
    logisticsReason: meta.hubs[city] ? meta.reason : 'Điểm nền từ danh sách thành phố, chưa được xác minh là hub cảng/sân bay',
    verifiedHub: Boolean(meta.hubs[city]),
    ...(LOGISTICS_DETAILS[city] || {}),
  })).sort((a, b) => b.logisticsScore - a.logisticsScore || a.city.localeCompare(b.city));
}

export function buildMarketRecommendations(product, countries = [], trade = null) {
  const classification = classifyProduct(product);
  const markets = countries.map((item, index) => ({
    country: item.country,
    countryReason: item.reason,
    keywords: item.keywords,
    aiRank: index + 1,
    tradeData: trade?.markets?.find((x) => x.country.toLowerCase() === item.country.toLowerCase()) || { status: trade?.status || 'not_loaded', source: null, year: null, exportValueUsd: null, hsCodes: classification.hs },
    cities: cityRecommendations(item.country),
  }));
  return { classification, markets, tradeDataStatus: trade?.status || 'not_loaded' };
}

export const logisticsCountries = Object.keys(LOGISTICS);
