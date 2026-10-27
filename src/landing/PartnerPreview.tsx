import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Building2, Check, Download, Globe2, Info, MapPin, Search } from 'lucide-react';
import { exampleLink, searchExamples } from './landingData';

export function PartnerPreview() {
  const [exampleId, setExampleId] = useState('coffee');
  const [selectedId, setSelectedId] = useState('coffee-a');
  const [emailOnly, setEmailOnly] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const example = searchExamples.find(item => item.id === exampleId)!;
  const rows = example.businesses.filter(item => !emailOnly || item.contacts.includes('Email'));
  const selected = rows.find(item => item.id === selectedId) || rows[0];
  function downloadSample() {
    const csv = '\uFEFF' + [
      ['DỮ LIỆU GIẢ LẬP — KHÔNG DÙNG ĐỂ LIÊN HỆ'],
      ['Tên doanh nghiệp minh họa', 'Thành phố', 'Quốc gia', 'Ngành', 'Loại thông tin minh họa'],
      ...rows.map(item => [item.name, item.city, example.countryLabel, item.category, item.contacts.join(', ')]),
    ].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lead-finder-mau-${example.id}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  }
  return <section className="export-section export-preview" id="ket-qua" aria-labelledby="preview-title">
    <div className="export-container">
      <div className="export-section-top"><div><p className="export-kicker">DỮ LIỆU ĐỂ BẮT ĐẦU CUỘC HỘI THOẠI</p><h2 id="preview-title">Không còn tìm kiếm mơ hồ.<br />Bắt đầu với một danh sách.</h2></div><p>Nhìn rõ doanh nghiệp, địa điểm và thông tin liên hệ có sẵn. Tự kiểm tra mức độ phù hợp trước khi chào hàng.</p></div>
      <div className="export-demo">
        <div className="export-demo-top"><span className="export-demo-title"><span className="export-mini-logo"><Search size={16} /></span>Khám phá đối tác</span><span className="export-demo-label"><Info size={14} /> Bản xem thử · Dữ liệu giả lập</span></div>
        <div className="export-demo-tools"><div className="export-demo-options" role="group" aria-label="Chọn ví dụ ngành hàng">{searchExamples.map(item => <button type="button" aria-pressed={exampleId === item.id} key={item.id} onClick={() => { setExampleId(item.id); setSelectedId(item.businesses[0].id); setDownloaded(false); }}>{item.product}<span>{item.code}</span></button>)}</div><button type="button" className="export-download" onClick={downloadSample}><Download size={16} /> Tải CSV mẫu</button></div>
        <div className="export-demo-query"><span><Search size={15} /><strong>{example.keyword}</strong><span className="export-query-separator">/</span><Globe2 size={15} />{example.countryLabel}</span><label><input type="checkbox" checked={emailOnly} onChange={event => setEmailOnly(event.target.checked)} /> Chỉ hiện mẫu có email</label></div>
        <div className="export-demo-content"><div className="export-company-list"><div className="export-list-heading"><span>DOANH NGHIỆP MINH HỌA</span><span>THÔNG TIN</span></div>{rows.map(business => <button type="button" className="export-company-row" aria-pressed={selected.id === business.id} key={business.id} onClick={() => setSelectedId(business.id)}><span className="export-company-avatar">{business.initials}</span><span className="export-company-name"><strong>{business.name}</strong><span><MapPin size={12} />{business.city}, {example.countryLabel}</span></span><span className="export-company-contacts">{business.contacts.slice(0,2).map(contact => <span key={contact}>{contact}</span>)}</span><ArrowUpRight size={16} /></button>)}</div><aside className="export-company-detail" aria-live="polite"><span className="export-detail-icon"><Building2 size={23} /></span><p className="export-detail-eyebrow">HỒ SƠ MINH HỌA</p><h3>{selected.name}</h3><p><MapPin size={14} />{selected.city}, {example.countryLabel}</p><dl><div><dt>Nhóm ngành</dt><dd>{selected.category}</dd></div><div><dt>Loại thông tin</dt><dd>{selected.contacts.join(' · ')}</dd></div></dl><a href={exampleLink(example)}>Tìm doanh nghiệp thực tế <ArrowRight size={15} /></a></aside></div>
        <div className="export-demo-bottom"><span><Info size={15} /> Tên doanh nghiệp và thông tin trong bản xem thử là giả lập. Kết quả thật tùy từng lần tìm.</span><span aria-live="polite">{downloaded ? <><Check size={15} /> Đã tải CSV mẫu</> : `${rows.length} hồ sơ minh họa`}</span></div>
      </div>
      <div className="export-data-note"><span>NGUỒN DỮ LIỆU</span><p>Thông tin công khai từ Google Maps và website doanh nghiệp. Email, điện thoại có thể không đầy đủ; danh sách chưa xác nhận nhu cầu mua hàng.</p></div>
    </div>
  </section>;
}
