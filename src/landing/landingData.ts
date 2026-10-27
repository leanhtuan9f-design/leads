export interface ExampleBusiness {
  id: string;
  name: string;
  city: string;
  category: string;
  initials: string;
  contacts: string[];
}
export interface SearchExample {
  id: string;
  product: string;
  country: string;
  countryLabel: string;
  code: string;
  keyword: string;
  businesses: ExampleBusiness[];
}
export const searchExamples: SearchExample[] = [
  { id: 'coffee', product: 'Cà phê rang xay', country: 'Germany', countryLabel: 'Đức', code: 'DE', keyword: 'coffee importer', businesses: [
    { id: 'coffee-a', name: 'Nhà nhập khẩu cà phê A', city: 'Hamburg', category: 'Nhập khẩu cà phê', initials: 'CA', contacts: ['Website', 'Email'] },
    { id: 'coffee-b', name: 'Đơn vị phân phối cà phê B', city: 'Berlin', category: 'Phân phối thực phẩm', initials: 'CB', contacts: ['Website', 'Điện thoại'] },
    { id: 'coffee-c', name: 'Doanh nghiệp bán buôn C', city: 'Bremen', category: 'Bán buôn cà phê', initials: 'CC', contacts: ['Website', 'Email', 'Điện thoại'] },
  ] },
  { id: 'cashew', product: 'Hạt điều', country: 'United States', countryLabel: 'Hoa Kỳ', code: 'US', keyword: 'nuts wholesaler', businesses: [
    { id: 'cashew-a', name: 'Nhà nhập khẩu hạt A', city: 'Los Angeles', category: 'Nhập khẩu thực phẩm', initials: 'HA', contacts: ['Website', 'Email'] },
    { id: 'cashew-b', name: 'Doanh nghiệp bán buôn B', city: 'New York', category: 'Bán buôn hạt dinh dưỡng', initials: 'HB', contacts: ['Website', 'Điện thoại'] },
    { id: 'cashew-c', name: 'Nhà phân phối thực phẩm C', city: 'Houston', category: 'Phân phối thực phẩm', initials: 'HC', contacts: ['Website', 'Email', 'Điện thoại'] },
  ] },
  { id: 'furniture', product: 'Nội thất gỗ', country: 'Australia', countryLabel: 'Úc', code: 'AU', keyword: 'furniture distributor', businesses: [
    { id: 'furniture-a', name: 'Nhà phân phối nội thất A', city: 'Sydney', category: 'Phân phối nội thất', initials: 'GA', contacts: ['Website', 'Email'] },
    { id: 'furniture-b', name: 'Doanh nghiệp bán buôn B', city: 'Melbourne', category: 'Bán buôn đồ gỗ', initials: 'GB', contacts: ['Website', 'Điện thoại'] },
    { id: 'furniture-c', name: 'Nhà cung cấp nội thất C', city: 'Brisbane', category: 'Nội thất thương mại', initials: 'GC', contacts: ['Website', 'Email', 'Điện thoại'] },
  ] },
];
export function exampleLink(example: SearchExample): string {
  return `/app?${new URLSearchParams({ product: example.product, country: example.country, keyword: example.keyword })}`;
}
