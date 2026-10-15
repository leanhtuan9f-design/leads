import React, { useState } from 'react';
import { Terminal, Copy, Check, Code, Play, Shield, Globe } from 'lucide-react';
import { HelpButton } from './HelpButton';

interface ApiDocsModalProps {
  onOpenGuide?: (guideId: string) => void;
}

export const ApiDocsModal: React.FC<ApiDocsModalProps> = ({ onOpenGuide }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<'cli' | 'curl' | 'node' | 'python'>('cli');

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const cliSnippet = `# 1. Tải về và biên dịch mã nguồn gosom/google-maps-scraper
git clone https://github.com/gosom/google-maps-scraper.git
cd google-maps-scraper
go build -o google-maps-scraper

# 2. Chạy cào dữ liệu kèm bóc tách Email và xoay vòng Proxy
./google-maps-scraper \\
  -depth 50 \\
  -email \\
  -proxies proxies.txt \\
  -results leads.csv \\
  "Nha khoa tại Hà Nội" "Quán cà phê tại TP.HCM"`;

  const curlSnippet = `curl -X POST "https://api.scraper.gosom.dev/v1/jobs" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "queries": ["Nha khoa tại Hà Nội", "Thẩm mỹ viện tại TP.HCM"],
    "max_results": 50,
    "extract_emails": true,
    "extract_socials": true,
    "skip_without_phone": false,
    "proxy_type": "datacenter_rotating",
    "webhook_url": "https://your-crm.com/webhooks/gmaps"
  }'`;

  const nodeSnippet = `// Tích hợp Node.js / TypeScript tự động hóa
import { ScraperClient } from '@gosom/gmaps-scraper';

const client = new ScraperClient({ apiKey: process.env.SCRAPER_API_KEY });

async function run() {
  const job = await client.createJob({
    query: 'Công ty thiết kế nội thất tại Đà Nẵng',
    maxResults: 50,
    extractEmails: true,
  });

  console.log(\`Tác vụ \${job.id} đã khởi động. Đang nhận dữ liệu stream...\`);

  job.on('lead', (lead) => {
    console.log(\`Tìm thấy: \${lead.title} | Email: \${lead.email} | SĐT: \${lead.phone}\`);
  });

  const results = await job.waitForCompletion();
  console.log(\`Đã cào thành công \${results.length} hồ sơ B2B đã xác thực\`);
}

run();`;

  const pythonSnippet = `# Tích hợp với Python requests
import requests
import json

payload = {
    "queries": ["Khách sạn tại Đà Lạt"],
    "max_results": 50,
    "extract_emails": True,
    "extract_socials": True
}

headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}

response = requests.post("https://api.scraper.gosom.dev/v1/jobs", json=payload, headers=headers)
job_data = response.json()
print(f"Khởi chạy thành công tác vụ ID: {job_data['job_id']}")`;

  const codeMap = {
    cli: cliSnippet,
    curl: curlSnippet,
    node: nodeSnippet,
    python: pythonSnippet
  };

  return (
    <div className="space-y-5 text-xs">
      {/* Intro Banner */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-md">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Kiến trúc gosom/google-maps-scraper & Tài liệu REST API</h2>
                {onOpenGuide && (
                  <HelpButton guideId="api_cli" onOpenGuide={onOpenGuide} tooltipText="Xem hướng dẫn tích hợp API & CLI" />
                )}
              </div>
              <p className="text-[11px] text-slate-400">Hệ thống cào dữ liệu Google Maps đa luồng viết bằng Go, hỗ trợ Webhook và Proxy Pool</p>
            </div>
          </div>
        </div>
        <p className="text-slate-300 text-xs leading-relaxed mt-2">
          Phát triển dựa trên kiến trúc mã nguồn mở <strong className="text-white">gosom/google-maps-scraper</strong> sử dụng framework <code className="text-blue-400 font-mono">scrapemate</code>. Hệ thống đạt tốc độ cào bình quân lên tới 120 địa điểm/phút với khả năng giả lập trình duyệt, tự động cuộn danh sách (viewport stepping), bóc tách số điện thoại và quét email từ website.
        </p>
      </div>

      <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg text-xs text-amber-200">
        <strong>Lưu ý:</strong> Các ví dụ cURL / Node.js / Python bên dưới dùng endpoint <code>api.scraper.gosom.dev</code> và gói <code>@gosom/gmaps-scraper</code> chỉ mang tính minh họa — chúng không tồn tại. API thật của ứng dụng này là <code>POST /api/jobs</code>, <code>GET /api/jobs/:id/events</code> (SSE), <code>DELETE /api/jobs/:id</code>.
      </div>

      {/* Code Playground */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        {/* Language Tabs */}
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveLang('cli')}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                activeLang === 'cli' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Lệnh CLI Terminal
            </button>
            <button
              onClick={() => setActiveLang('curl')}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                activeLang === 'curl' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              cURL (REST API)
            </button>
            <button
              onClick={() => setActiveLang('node')}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                activeLang === 'node' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Node.js
            </button>
            <button
              onClick={() => setActiveLang('python')}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                activeLang === 'python' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Python
            </button>
          </div>

          <button
            onClick={() => handleCopy(codeMap[activeLang], activeLang)}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded text-[11px] font-mono transition-colors flex items-center gap-1.5"
          >
            {copiedKey === activeLang ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === activeLang ? 'Đã sao chép mã!' : 'Sao chép mã'}</span>
          </button>
        </div>

        {/* Code Content */}
        <div className="p-4 bg-[#070b12] overflow-x-auto">
          <pre className="font-mono text-[11px] text-slate-200 leading-relaxed">
            {codeMap[activeLang]}
          </pre>
        </div>
      </div>

      {/* Extracted Schema Field Reference */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Quy chuẩn dữ liệu đầu ra JSON (33+ trường tiêu chuẩn)</h3>
        <p className="text-[11px] text-slate-400 mb-3">Tất cả các trường sau đều được trích xuất và hỗ trợ xuất ra file CSV / JSON:</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[11px]">
          {[
            'title (Tên DN)', 'category (Ngành)', 'subcategories[]', 'address (Địa chỉ)',
            'street (Đường)', 'city (Thành phố)', 'state (Tỉnh)', 'postal_code (Mã bưu chính)',
            'country (Quốc gia)', 'phone (SĐT)', 'website', 'email (Email quét)',
            'additional_emails[]', 'instagram', 'facebook', 'linkedin',
            'twitter', 'rating (Điểm sao 1-5)', 'reviews_count (Lượt review)', 'price_level (Mức giá)',
            'is_claimed (Xác minh)', 'is_open_now (Mở cửa)', 'open_hours (Giờ làm)', 'latitude (Vĩ độ)',
            'longitude (Kinh độ)', 'google_maps_url (Link Maps)', 'place_id (ID địa điểm)', 'photos_count (Số ảnh)'
          ].map((field, idx) => (
            <div key={idx} className="p-2 bg-slate-900 border border-slate-800 rounded text-slate-300">
              <span className="text-blue-400 font-semibold">{field.split(' ')[0]}</span>
              {field.includes('(') && <span className="text-slate-400 text-[10px]"> {field.slice(field.indexOf('('))}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
