import { ScrapedBusiness } from '../types/scraper';

function escapeCsvField(field: any): string {
  if (field === undefined || field === null) return '""';
  const str = String(field);
  return `"${str.replace(/"/g, '""')}"`;
}

export function exportToCsv(businesses: ScrapedBusiness[], filename = 'google_maps_leads.csv'): void {
  const headers = [
    'Business Name',
    'Category',
    'Subcategories',
    'Phone',
    'Email',
    'Additional Emails',
    'Website',
    'Address',
    'Street',
    'City',
    'State',
    'Postal Code',
    'Country',
    'Rating',
    'Reviews Count',
    'Price Level',
    'Is Claimed',
    'Is Open Now',
    'Open Hours',
    'Instagram',
    'Facebook',
    'LinkedIn',
    'Twitter',
    'Latitude',
    'Longitude',
    'Google Maps URL',
    'Place ID',
    'Photos Count',
    'Lead Score',
    'Lead Quality',
    'Scraped Date'
  ];

  const rows = businesses.map(b => [
    escapeCsvField(b.title),
    escapeCsvField(b.category),
    escapeCsvField(b.subcategories.join(', ')),
    escapeCsvField(b.phone),
    escapeCsvField(b.email),
    escapeCsvField(b.additionalEmails.join(', ')),
    escapeCsvField(b.website),
    escapeCsvField(b.address),
    escapeCsvField(b.street),
    escapeCsvField(b.city),
    escapeCsvField(b.state),
    escapeCsvField(b.postalCode),
    escapeCsvField(b.country),
    escapeCsvField(b.rating),
    escapeCsvField(b.reviewsCount),
    escapeCsvField(b.priceLevel),
    escapeCsvField(b.isClaimed ? 'YES' : 'NO'),
    escapeCsvField(b.isOpenNow ? 'YES' : 'NO'),
    escapeCsvField(b.openHoursSummary),
    escapeCsvField(b.socials.instagram || ''),
    escapeCsvField(b.socials.facebook || ''),
    escapeCsvField(b.socials.linkedin || ''),
    escapeCsvField(b.socials.twitter || ''),
    escapeCsvField(b.latitude),
    escapeCsvField(b.longitude),
    escapeCsvField(b.googleMapsUrl),
    escapeCsvField(b.placeId),
    escapeCsvField(b.photosCount),
    escapeCsvField(b.leadScore),
    escapeCsvField(b.leadStatus.toUpperCase()),
    escapeCsvField(b.scrapedAt)
  ].join(','));

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToJson(businesses: ScrapedBusiness[], filename = 'google_maps_leads.json'): void {
  const jsonContent = JSON.stringify(businesses, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportForCrm(businesses: ScrapedBusiness[], filename = 'crm_outreach_ready.csv'): void {
  // Cold outreach CRM standard: First Name, Company Name, Email, Phone, Website, City, Custom Variable 1
  const headers = [
    'Company',
    'Email',
    'Phone',
    'Website',
    'City',
    'Rating',
    'Reviews',
    'Category',
    'Maps_Link'
  ];

  const rows = businesses
    .filter(b => b.email || b.phone)
    .map(b => [
      escapeCsvField(b.title),
      escapeCsvField(b.email),
      escapeCsvField(b.phone),
      escapeCsvField(b.website),
      escapeCsvField(b.city),
      escapeCsvField(b.rating),
      escapeCsvField(b.reviewsCount),
      escapeCsvField(b.category),
      escapeCsvField(b.googleMapsUrl)
    ].join(','));

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyToClipboardTsv(businesses: ScrapedBusiness[]): Promise<boolean> {
  try {
    const headers = ['Business Name', 'Phone', 'Email', 'Website', 'City', 'State', 'Rating', 'Reviews', 'Lead Score'];
    const rows = businesses.map(b => [
      b.title,
      b.phone,
      b.email,
      b.website,
      b.city,
      b.state,
      b.rating,
      b.reviewsCount,
      b.leadScore
    ].join('\t'));

    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    await navigator.clipboard.writeText(tsvContent);
    return true;
  } catch (err) {
    return false;
  }
}
