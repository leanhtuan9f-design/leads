export interface ScrapedBusiness {
  id: string;
  title: string;
  category: string;
  subcategories: string[];
  address: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  website: string;
  email: string;
  additionalEmails: string[];
  socials: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    twitter?: string;
    youtube?: string;
  };
  rating: number;
  reviewsCount: number;
  priceLevel: string;
  isClaimed: boolean;
  isOpenNow: boolean;
  openHoursSummary: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
  placeId: string;
  photosCount: number;
  leadScore: number; // 0-100 calculated score
  leadStatus: 'hot' | 'warm' | 'cold';
  scrapedAt: string;
  possiblyClosed?: boolean; // lần cào lại gần nhất không còn thấy cơ sở này
}

export interface ScraperOptions {
  query: string;
  category?: string;
  location?: string;
  country?: string; // quốc gia đang tìm; gói giới hạn quốc gia bắt buộc có
  city?: string;
  maxResults: number;
  extractEmails: boolean;
  extractSocials?: boolean; // không còn dùng (engine không trả link mạng xã hội)
  skipWithoutPhone: boolean;
  skipWithoutWebsite: boolean;
  proxyType?: 'direct' | 'datacenter_rotating' | 'residential_proxy'; // chỉ để tương thích job cũ trong localStorage
  language: string;
  forceRefresh?: boolean; // bỏ qua kho dữ liệu đã lưu, cào mới (giới hạn số lần/ngày)
  proxies?: string[]; // proxy do người dùng nhập (http/https/socks5), mỗi lần cào đi qua các proxy này
  existingBusinesses?: ScrapedBusiness[];
  scrapeMode?: 'batch' | 'exhaustive';
  useDistrictSubdivision?: boolean;
  selectedDistricts?: string[];
}

export interface ScraperJob {
  id: string;
  name: string;
  query: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  totalFound: number;
  scrapedCount: number;
  targetCount: number;
  speedPerMin: number;
  startedAt: string;
  finishedAt?: string;
  options: ScraperOptions;
  results: ScrapedBusiness[];
}

export interface FilterOptions {
  searchQuery: string;
  category: string;
  hasEmailOnly: boolean;
  hasPhoneOnly: boolean;
  hasWebsiteOnly: boolean;
  claimedOnly: boolean | null; // null = any, true = claimed, false = unclaimed
  minRating: number;
  minReviews: number;
  leadStatus: 'all' | 'hot' | 'warm' | 'cold';
}

export type ActiveTab = 'leads' | 'map' | 'jobs' | 'analytics' | 'api' | 'admin' | 'background' | 'customs' | 'aiconfig' | 'marketconfig' | 'billingconfig';
