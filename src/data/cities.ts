// Thành phố lớn / đầu mối nhập khẩu theo quốc gia (tên tiếng Anh như người bản địa gõ trên Google Maps).
// Dùng để gợi ý tức thì sau khi chọn quốc gia, không cần chờ AI. Tìm kiếm = từ khóa + thành phố.
export const CITIES: Record<string, string[]> = {
  'United States': ['Los Angeles', 'New York', 'Houston', 'San Jose', 'Seattle', 'Chicago', 'Dallas', 'Atlanta', 'Miami', 'Westminster, CA'],
  Japan: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Fukuoka', 'Kobe', 'Sapporo'],
  'South Korea': ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Gwangju', 'Daejeon'],
  China: ['Shanghai', 'Guangzhou', 'Shenzhen', 'Beijing', 'Hangzhou', 'Chengdu', 'Qingdao'],
  Germany: ['Hamburg', 'Berlin', 'Frankfurt', 'Munich', 'Cologne', 'Düsseldorf', 'Stuttgart'],
  France: ['Paris', 'Marseille', 'Lyon', 'Lille', 'Bordeaux', 'Toulouse'],
  'United Kingdom': ['London', 'Birmingham', 'Manchester', 'Leeds', 'Glasgow', 'Bristol'],
  Netherlands: ['Rotterdam', 'Amsterdam', 'The Hague', 'Utrecht', 'Eindhoven'],
  Italy: ['Milan', 'Rome', 'Naples', 'Turin', 'Genoa', 'Bologna'],
  Spain: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Bilbao'],
  Poland: ['Warsaw', 'Kraków', 'Wrocław', 'Łódź', 'Poznań', 'Gdańsk'],
  Russia: ['Moscow', 'Saint Petersburg', 'Novosibirsk', 'Yekaterinburg', 'Vladivostok'],
  Australia: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
  'New Zealand': ['Auckland', 'Wellington', 'Christchurch'],
  Canada: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton'],
  Singapore: ['Singapore'],
  Malaysia: ['Kuala Lumpur', 'Johor Bahru', 'Penang', 'Klang', 'Kota Kinabalu'],
  Thailand: ['Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya', 'Khon Kaen'],
  Indonesia: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bali'],
  Philippines: ['Manila', 'Quezon City', 'Cebu City', 'Davao City'],
  India: ['Mumbai', 'Delhi', 'Chennai', 'Bangalore', 'Kolkata', 'Hyderabad'],
  'United Arab Emirates': ['Dubai', 'Abu Dhabi', 'Sharjah'],
  'Saudi Arabia': ['Riyadh', 'Jeddah', 'Dammam'],
  Turkey: ['Istanbul', 'Ankara', 'Izmir', 'Bursa'],
  Taiwan: ['Taipei', 'Kaohsiung', 'Taichung', 'Taoyuan'],
  'Hong Kong': ['Hong Kong', 'Kowloon'],
  Mexico: ['Mexico City', 'Guadalajara', 'Monterrey', 'Tijuana'],
  Brazil: ['São Paulo', 'Rio de Janeiro', 'Santos', 'Curitiba'],
  'South Africa': ['Johannesburg', 'Cape Town', 'Durban'],
  Belgium: ['Antwerp', 'Brussels', 'Ghent'],
  Sweden: ['Stockholm', 'Gothenburg', 'Malmö'],
  Denmark: ['Copenhagen', 'Aarhus'],
  Switzerland: ['Zurich', 'Geneva', 'Basel'],
  Egypt: ['Cairo', 'Alexandria'],
  Pakistan: ['Karachi', 'Lahore'],
  Cambodia: ['Phnom Penh', 'Siem Reap'],
  Laos: ['Vientiane'],
  Czechia: ['Prague', 'Brno'],
  Ukraine: ['Kyiv', 'Odesa'],
};

const ALIAS: Record<string, string> = {
  usa: 'United States', us: 'United States', america: 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', england: 'United Kingdom', korea: 'South Korea', uae: 'United Arab Emirates',
  'czech republic': 'Czechia', holland: 'Netherlands', 'the netherlands': 'Netherlands',
};

const LOWER = new Map(Object.keys(CITIES).map(k => [k.toLowerCase(), k]));

/** Thành phố gợi ý cho một quốc gia (khớp không phân biệt hoa thường); [] nếu chưa có trong bảng. */
export function citiesFor(country: string): string[] {
  const k = country.trim().toLowerCase();
  const name = LOWER.get(k) || LOWER.get((ALIAS[k] || '').toLowerCase());
  return name ? CITIES[name] : [];
}
