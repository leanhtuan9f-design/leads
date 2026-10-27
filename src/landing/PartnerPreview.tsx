import { useState } from 'react';
import {
  IconArrowRight, IconArmchair, IconCheck, IconChevronDown, IconCoffee,
  IconDownload, IconInfoCircle, IconLink, IconMail, IconPlant2, IconX,
} from '@tabler/icons-react';
import { exampleLink, searchExamples } from './landingData';

export function PartnerPreview() {
  const [exampleId, setExampleId] = useState('coffee');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailOnly, setEmailOnly] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const example = searchExamples.find(item => item.id === exampleId)!;
  const rows = example.businesses.filter(item => !emailOnly || item.contacts.includes('Email'));
  const selected = rows.find(item => item.id === selectedId);
  const IndustryIcon = exampleId === 'coffee' ? IconCoffee : exampleId === 'cashew' ? IconPlant2 : IconArmchair;
  function downloadSample() {
    const csv = '\uFEFF' + [
      ['DỮ LIỆU GIẢ LẬP — KHÔNG DÙNG ĐỂ LIÊN HỆ'],
      ['Tên doanh nghiệp minh họa', 'Thành phố', 'Quốc gia', 'Ngành', 'Loại thông tin minh họa'],
      ...rows.map(item => [item.name, item.city, example.countryLabel, item.category, item.contacts.join(', ')]),
    ].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `lead-finder-mau-${example.id}.csv`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloaded(true);
  }
  return <section className="export-preview export-container" id="ket-qua" aria-labelledby="preview-title">
    <div className="export-preview-intro"><p className="export-kicker">TỪ DỮ LIỆU ĐẾN CƠ HỘI</p><h2 id="preview-title">Từ tìm kiếm<br/>đến kết nối.</h2><p>Nhận danh sách doanh nghiệp theo sản phẩm và thị trường của bạn, kèm thông tin liên hệ công khai khi có.</p><span className="export-demo-label"><IconInfoCircle size={14}/>Dữ liệu minh họa</span><a href={exampleLink(example)} className="export-text-link">Tìm doanh nghiệp thực tế <IconArrowRight size={17}/></a></div>
    <div className="export-preview-main"><div className="export-table-surface"><div className="export-table-scroll"><table><caption className="export-sr-only">Ví dụ cấu trúc kết quả — tên doanh nghiệp và thông tin là giả lập</caption><thead><tr><th scope="col">DOANH NGHIỆP</th><th scope="col">QUỐC GIA</th><th scope="col">NGÀNH HOẠT ĐỘNG</th><th scope="col">THÔNG TIN KHI CÓ</th></tr></thead><tbody>{rows.map(business => <tr key={business.id} className={selectedId === business.id ? 'export-row-selected' : ''}><td><button type="button" className="export-company-button" aria-expanded={selectedId === business.id} aria-controls="export-sample-detail" onClick={() => setSelectedId(selectedId === business.id ? null : business.id)}><span className="export-company-avatar">{business.initials}</span><span><strong>{business.name}</strong><small>{business.city}</small></span></button></td><td><span className="export-country-code">{example.code}</span><span>{example.countryLabel}</span></td><td><span className="export-industry"><IndustryIcon size={27} stroke={1.6}/>{business.category}</span></td><td><div className="export-contact-lines"><span><IconLink size={16}/>Website công khai</span><span><IconMail size={16}/>{business.contacts.includes('Email') ? 'Email khi có' : 'Điện thoại khi có'}</span></div></td></tr>)}</tbody></table></div><p className="export-table-hint">Vuốt ngang để xem thêm thông tin</p><div className="export-demo-toolbar"><div className="export-demo-selector"><label htmlFor="export-example">Xem ví dụ:</label><select id="export-example" value={exampleId} onChange={event => { setExampleId(event.target.value); setSelectedId(null); setDownloaded(false); }}>{searchExamples.map(item => <option value={item.id} key={item.id}>{item.product} · {item.countryLabel}</option>)}</select><IconChevronDown size={14}/></div><button type="button" className="export-download" onClick={downloadSample}><IconDownload size={16}/>Tải CSV mẫu</button></div></div>
      {selected ? <aside className="export-company-detail" id="export-sample-detail" aria-live="polite"><div><p>HỒ SƠ MINH HỌA</p><h3>{selected.name}</h3><span>{selected.city}, {example.countryLabel} · {selected.category}</span></div><p>Loại thông tin: {selected.contacts.join(' · ')}. Đây là ví dụ giả lập để xem cấu trúc kết quả.</p><a href={exampleLink(example)}>Tìm doanh nghiệp thực tế <IconArrowRight size={16}/></a><button type="button" aria-label="Đóng hồ sơ minh họa" onClick={() => setSelectedId(null)}><IconX size={18}/></button></aside> : <span id="export-sample-detail" hidden/>}
      <div className="export-demo-foot"><label><input type="checkbox" checked={emailOnly} onChange={event => setEmailOnly(event.target.checked)}/>Chỉ hiện mẫu có email</label><span aria-live="polite">{downloaded ? <><IconCheck size={14}/>Đã tải CSV mẫu</> : 'Tên và thông tin trong bảng là giả lập.'}</span></div>
    </div>
  </section>;
}
