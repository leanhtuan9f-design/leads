import React, { useState } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';
import { HelpButton } from './HelpButton';

interface ApiDocsModalProps {
  onOpenGuide?: (guideId: string) => void;
}

type Lang = 'curl' | 'node' | 'python';

export const ApiDocsModal: React.FC<ApiDocsModalProps> = ({ onOpenGuide }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<Lang>('curl');

  const base = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain';

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const curlSnippet = `# 0. Đăng nhập (lưu cookie phiên vào cookies.txt)
curl -c cookies.txt -X POST "${base}/api/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com", "password": "..."}'

# 1. Tạo tác vụ cào (trả về {"id": "..."})
curl -b cookies.txt -X POST "${base}/api/jobs" \\
  -H "Content-Type: application/json" \\
  -d '{
    "queries": ["Phòng khám nha khoa Cầu Giấy, Hà Nội"],
    "maxResults": 25,
    "extractEmails": true,
    "lang": "vi"
  }'

# 2. Nhận kết quả theo luồng (Server-Sent Events): event "place" cho mỗi địa điểm, "end" khi xong
curl -b cookies.txt -N "${base}/api/jobs/JOB_ID/events"

# 3. Hủy tác vụ
curl -b cookies.txt -X DELETE "${base}/api/jobs/JOB_ID"`;

  const nodeSnippet = `// Node.js 18+ (fetch có sẵn)
const BASE = '${base}';

// Đăng nhập, lấy cookie phiên rồi gửi kèm các yêu cầu sau
const login = await fetch(\`\${BASE}/api/auth/login\`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'you@example.com', password: '...' }),
});
const cookie = login.headers.get('set-cookie').split(';')[0];

const res = await fetch(\`\${BASE}/api/jobs\`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    queries: ['Quán cà phê Quận 1, Hồ Chí Minh'],
    maxResults: 25,
    extractEmails: true,
  }),
});
const { id } = await res.json();

const stream = await fetch(\`\${BASE}/api/jobs/\${id}/events\`, { headers: { Cookie: cookie } });
const decoder = new TextDecoder();
let buf = '';
for await (const chunk of stream.body) {
  buf += decoder.decode(chunk, { stream: true });
  const parts = buf.split('\\n\\n');
  buf = parts.pop();
  for (const block of parts) {
    const event = /^event: (.*)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (event === 'place') {
      const lead = JSON.parse(data);
      console.log(lead.title, '|', lead.phone, '|', lead.email);
    }
  }
}`;

  const pythonSnippet = `import json
import requests

BASE = "${base}"

s = requests.Session()
s.post(f"{BASE}/api/auth/login", json={"email": "you@example.com", "password": "..."}).raise_for_status()

job = s.post(f"{BASE}/api/jobs", json={
    "queries": ["Công ty luật Đà Nẵng"],
    "maxResults": 25,
    "extractEmails": True,
}).json()

with s.get(f"{BASE}/api/jobs/{job['id']}/events", stream=True) as r:
    event = None
    for line in r.iter_lines(decode_unicode=True):
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: ") and event == "place":
            lead = json.loads(line[6:])
            print(lead["title"], "|", lead["phone"], "|", lead["email"])`;

  const codeMap: Record<Lang, string> = { curl: curlSnippet, node: nodeSnippet, python: pythonSnippet };
  const tabs: { key: Lang; label: string }[] = [
    { key: 'curl', label: 'cURL' },
    { key: 'node', label: 'Node.js' },
    { key: 'python', label: 'Python' },
  ];

  return (
    <div className="space-y-5 text-xs">
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 bg-blue-600/20 text-blue-400 rounded-md">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">Tài liệu REST API</h2>
              {onOpenGuide && (
                <HelpButton guideId="api_cli" onOpenGuide={onOpenGuide} tooltipText="Xem hướng dẫn tích hợp API" />
              )}
            </div>
            <p className="text-[11px] text-slate-400">Tạo tác vụ cào và nhận kết quả theo thời gian thực từ hệ thống của bạn</p>
          </div>
        </div>
        <ul className="text-slate-300 leading-relaxed mt-2 space-y-1 list-disc pl-5">
          <li><code className="text-blue-400 font-mono">POST /api/jobs</code> — tạo tác vụ. Tham số: <code className="font-mono">queries[]</code> (tối đa 12), <code className="font-mono">maxResults</code> (tối đa 300), <code className="font-mono">extractEmails</code>, <code className="font-mono">lang</code>, <code className="font-mono">geo</code> ("lat,lon") + <code className="font-mono">radius</code> (mét), <code className="font-mono">proxies[]</code> (tối đa 10).</li>
          <li><code className="text-blue-400 font-mono">GET /api/jobs/:id/events</code> — luồng SSE: <code className="font-mono">status</code>, <code className="font-mono">place</code> (một địa điểm), <code className="font-mono">end</code>.</li>
          <li><code className="text-blue-400 font-mono">DELETE /api/jobs/:id</code> — hủy tác vụ.</li>
          <li><code className="text-blue-400 font-mono">POST /api/auth/login</code> — đăng nhập (email, password), nhận cookie phiên; các lời gọi <code className="font-mono">/api/jobs</code> đều cần cookie này. Tài khoản do quản trị viên cấp, mỗi tài khoản có hạn mức địa điểm mới và số lần làm mới mỗi ngày (vượt hạn mức sẽ nhận lỗi 429 hoặc chỉ nhận dữ liệu đã lưu).</li>
          <li>Chạy 1 tác vụ cào tại một thời điểm, tối đa 3 tác vụ xếp hàng; giới hạn 6 yêu cầu tạo tác vụ mỗi phút.</li>
        </ul>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveLang(t.key)}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                  activeLang === t.key ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleCopy(codeMap[activeLang], activeLang)}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded text-[11px] font-mono transition-colors flex items-center gap-1.5"
          >
            {copiedKey === activeLang ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === activeLang ? 'Đã sao chép mã!' : 'Sao chép mã'}</span>
          </button>
        </div>

        <div className="p-4 bg-[#0a1417] overflow-x-auto">
          <pre className="font-mono text-[11px] text-slate-200 leading-relaxed">{codeMap[activeLang]}</pre>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Các trường dữ liệu của mỗi địa điểm (event "place")</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[11px]">
          {[
            'title (Tên DN)', 'category (Ngành)', 'subcategories[]', 'address (Địa chỉ)',
            'street (Đường)', 'city (Thành phố)', 'state (Tỉnh)', 'postalCode (Mã bưu chính)',
            'country (Quốc gia)', 'phone (SĐT)', 'website', 'email (Email quét)',
            'additionalEmails[]', 'rating (Điểm sao 1-5)', 'reviewsCount (Lượt review)', 'priceLevel (Mức giá)',
            'isClaimed (Xác minh)', 'isOpenNow (Mở cửa)', 'openHoursSummary (Giờ làm)', 'latitude (Vĩ độ)',
            'longitude (Kinh độ)', 'googleMapsUrl (Link Maps)', 'placeId (ID địa điểm)', 'photosCount (Số ảnh)'
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
