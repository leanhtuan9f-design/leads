import { useState } from 'react';
import {
  IconArrowRight, IconArrowUpRight, IconBuildingSkyscraper, IconCheck,
  IconChevronDown, IconCompass, IconDownload, IconId, IconMenu2,
  IconPlayerPlay, IconSearch, IconWorld, IconX,
} from '@tabler/icons-react';
import { PartnerPreview } from './PartnerPreview';
import { WarehouseStats } from './WarehouseStats';
import { LandingPricing } from './LandingPricing';
import './landing.css';

const markets = [
  ['United States', 'Hoa Kỳ'], ['Germany', 'Đức'], ['Japan', 'Nhật Bản'],
  ['South Korea', 'Hàn Quốc'], ['Australia', 'Úc'], ['Singapore', 'Singapore'],
  ['Netherlands', 'Hà Lan'], ['United Kingdom', 'Anh'], ['Canada', 'Canada'], ['United Arab Emirates', 'UAE'],
];
const benefits = [
  { icon: IconSearch, title: 'Tìm doanh nghiệp tiềm năng', body: 'Tìm kiếm theo ngành hàng và quốc gia để khám phá các doanh nghiệp phù hợp.' },
  { icon: IconId, title: 'Xem thông tin liên hệ công khai', body: 'Tiếp cận website, email, điện thoại khi có sẵn trong nguồn công khai.' },
  { icon: IconDownload, title: 'Xuất danh sách CSV', body: 'Tải về danh sách để lưu trữ, phân công nghiên cứu và chuẩn bị chào hàng.' },
];
const questions = [
  ['Đây có phải những doanh nghiệp đang cần mua hàng?', 'Danh sách gồm doanh nghiệp được tìm theo từ khóa và địa điểm, chưa xác nhận nhu cầu mua hàng hay hoạt động nhập khẩu. Bạn cần xem website, kiểm tra thông tin và đánh giá mức độ phù hợp trước khi liên hệ.'],
  ['Tôi có thể tìm nhà nhập khẩu và nhà phân phối không?', 'Bạn có thể dùng từ khóa về nhà nhập khẩu, nhà phân phối hoặc bán buôn theo sản phẩm và thị trường. Kết quả phụ thuộc cách doanh nghiệp được mô tả trong nguồn công khai; không phải mọi kết quả đều đúng loại đối tác bạn cần.'],
  ['Thông tin liên hệ có những gì?', 'Khi có sẵn, kết quả gồm website, điện thoại, email cùng tên, ngành và địa chỉ doanh nghiệp. Không phải doanh nghiệp nào cũng có đầy đủ thông tin. Email công khai chưa đồng nghĩa với email đã xác thực hoặc liên hệ của người quyết định.'],
  ['Nếu tôi chưa biết nên chọn thị trường nào?', 'Nhập sản phẩm trong công cụ để xem gợi ý thị trường và từ khóa khi tính năng AI khả dụng. Đây là đầu vào để nghiên cứu thêm, không phải cam kết về tiềm năng bán hàng.'],
  ['Công cụ có tự gửi email chào hàng không?', 'Bạn có thể xuất dữ liệu và dùng tính năng hỗ trợ soạn nội dung để chủ động tiếp cận. Sản phẩm hiện không tự vận hành chiến dịch gửi email nền và không cam kết đơn hàng.'],
];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [product, setProduct] = useState('');
  const [country, setCountry] = useState('');
  return <div className="export-landing">
    <a className="export-skip" href="#noi-dung">Bỏ qua điều hướng</a>
    <header className="export-header"><div className="export-container export-header-inner">
      <a href="/" className="export-brand" aria-label="Lead Finder — Trang chủ"><IconCompass size={49} stroke={1.35} aria-hidden="true"/><span>Lead Finder</span></a>
      <nav className="export-desktop-nav" aria-label="Điều hướng chính"><a href="#ket-qua">Sản phẩm</a><a href="#cach-hoat-dong">Cách hoạt động</a><a href="#bang-gia">Bảng giá</a><a href="#cau-hoi">Câu hỏi thường gặp</a></nav>
      <div className="export-header-actions"><span className="export-language"><IconWorld size={20} aria-hidden="true"/> VI</span><a href="/app" className="export-login">Vào ứng dụng</a><a href="#bat-dau" className="export-button export-header-cta">Bắt đầu miễn phí <IconArrowRight size={17}/></a><button type="button" className="export-menu-toggle" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} aria-controls="export-mobile-menu" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <IconX size={24}/> : <IconMenu2 size={24}/>}</button></div>
    </div>{menuOpen ? <nav className="export-mobile-nav" id="export-mobile-menu" aria-label="Điều hướng di động" onKeyDown={event => { if (event.key === 'Escape') setMenuOpen(false); }}><a href="#ket-qua" onClick={() => setMenuOpen(false)}>Sản phẩm <IconArrowRight size={17}/></a><a href="#cach-hoat-dong" onClick={() => setMenuOpen(false)}>Cách hoạt động <IconArrowRight size={17}/></a><a href="#bang-gia" onClick={() => setMenuOpen(false)}>Bảng giá <IconArrowRight size={17}/></a><a href="/app">Vào ứng dụng <IconArrowUpRight size={17}/></a></nav> : null}</header>
    <main id="noi-dung">
      <div className="export-intro-surface">
        <section className="export-hero export-container" aria-labelledby="hero-title">
          <div className="export-hero-copy"><p className="export-kicker">DÀNH CHO DOANH NGHIỆP XUẤT KHẨU VIỆT NAM</p><h1 id="hero-title">Sản phẩm Việt.<br/><span>Đối tác toàn cầu.</span></h1><p className="export-hero-description">Tìm kiếm và tiếp cận các nhà nhập khẩu, nhà phân phối tiềm năng trên toàn thế giới dựa trên ngành hàng và thị trường mục tiêu.</p><div className="export-hero-actions"><a href="#bat-dau" className="export-button">Tìm đối tác ngay <IconArrowRight size={22}/></a><a href="#ket-qua" className="export-text-link"><span className="export-play-icon"><IconPlayerPlay size={19}/></span>Xem kết quả mẫu</a></div><div className="export-hero-points"><div><IconSearch size={31}/><span>Tìm kiếm theo<br/>ngành hàng và quốc gia</span></div><div><IconBuildingSkyscraper size={31}/><span>Thông tin doanh nghiệp<br/>công khai khi có</span></div><div><IconDownload size={31}/><span>Xuất danh sách CSV<br/>để tiếp cận và làm việc</span></div></div></div>
          <img className="export-hero-art" src="/landing/trade-hero-orange-cutout.png" alt="Minh họa tàu hàng, quả địa cầu, container và nông sản Việt Nam trên hành trình thương mại quốc tế" width="1513" height="1039" fetchPriority="high"/>
        </section>
        <section className="export-search-section export-container" id="bat-dau" aria-label="Bắt đầu tìm đối tác"><form action="/app" className="export-search-form"><div><label htmlFor="export-product">Sản phẩm xuất khẩu</label><span className="export-field"><IconSearch size={22}/><input name="product" id="export-product" placeholder="Cà phê, hạt điều, gỗ nội thất, thủy sản…" required maxLength={600} value={product} onChange={event => setProduct(event.target.value)}/></span></div><div><label htmlFor="export-country">Thị trường</label><span className="export-field"><IconWorld size={22}/><select name="country" id="export-country" value={country} onChange={event => setCountry(event.target.value)}><option value="">Chọn quốc gia / cần gợi ý</option>{markets.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select><IconChevronDown size={18}/></span></div><button type="submit" className="export-button"><IconSearch size={23}/>Tìm đối tác ngay <IconArrowRight size={18}/></button></form></section>
      </div>
      <PartnerPreview/>
      <section className="export-benefits export-container" id="cach-hoat-dong" aria-label="Cách hoạt động">{benefits.map(benefit => <article key={benefit.title}><span className="export-benefit-icon"><benefit.icon size={40} stroke={1.7}/></span><div><h2>{benefit.title}</h2><p>{benefit.body}</p></div></article>)}</section>
      <section className="export-market-note export-container"><IconWorld size={22}/><p><strong>Chủ động tìm kiếm. Kiểm tra trước khi kết nối.</strong> Dữ liệu từ Google Maps và website doanh nghiệp; thông tin liên hệ có thể không đầy đủ và chưa xác nhận nhu cầu mua hàng.</p><a href="/app">Mở công cụ <IconArrowUpRight size={17}/></a></section>
      <WarehouseStats/>
      <LandingPricing/>
      <section className="export-section export-container export-faq" id="cau-hoi" aria-labelledby="faq-title"><div><p className="export-kicker">HIỂU RÕ TRƯỚC KHI BẮT ĐẦU</p><h2 id="faq-title">Bạn hỏi.<br/>Chúng tôi giải đáp.</h2><p>Dữ liệu là điểm bắt đầu.<br/>Mối quan hệ do bạn xây dựng.</p></div><div>{questions.map(([question,answer]) => <details key={question}><summary>{question}<IconChevronDown size={19}/></summary><p>{answer}</p></details>)}</div></section>
      <section className="export-final export-container"><div><p className="export-kicker">VIỆT NAM VƯƠN RA THẾ GIỚI</p><h2>Sản phẩm đã sẵn sàng.<br/><span>Đối tác tiếp theo ở đâu?</span></h2></div><div><a href="#bat-dau" className="export-button">Bắt đầu tìm đối tác <IconArrowRight size={20}/></a><p><IconCheck size={16}/> Dùng thử miễn phí, chưa cần thanh toán.</p></div></section>
    </main>
    <footer className="export-footer export-container"><div><a href="/" className="export-brand"><IconCompass size={42} stroke={1.35}/><span>Lead Finder</span></a><p>Giúp nhà xuất khẩu Việt Nam<br/>chủ động tìm kiếm đối tác quốc tế.</p></div><nav aria-label="Điều hướng cuối trang"><a href="#ket-qua">Sản phẩm</a><a href="#bang-gia">Bảng giá</a><a href="/app">Mở ứng dụng <IconArrowUpRight size={15}/></a></nav><div className="export-footer-note"><span>VIETNAM TO THE WORLD</span><p>Thông tin công khai. Kết nối có chọn lọc.</p></div></footer>
  </div>;
}
