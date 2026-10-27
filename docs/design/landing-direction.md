# Landing xuất khẩu — thiết kế lại 2026-10-27

Nguồn skill: https://github.com/HoangNguyen0403/agent-skills-standard/tree/develop/skills/common/common-ui-design (revision 92d06c4). Đã đọc common-ui-design + tones/human-direction, common-accessibility, react-component-patterns, react-typescript và common-web-visual-testing.

- Audience & Task: chủ doanh nghiệp và đội xuất khẩu Việt Nam; hiểu giá trị dữ liệu, chọn sản phẩm/thị trường, mở công cụ để tìm đối tác.
- Character: rõ ràng, quyết đoán, chuyên nghiệp. Aesthetic: B2B trade editorial; typography Be Vietnam Pro self-host để chữ Việt dễ đọc, body 13–16px theo vùng, chữ micro-label 9–12px; giữ body app cũ bằng self-host Plus Jakarta Sans/JetBrains Mono.
- Keep: domain, homepage `/`, công cụ `/app`, truyền product/country/keyword, bảng giá API, billing modal hiện hữu, Lead admin-only.
- Change: thay palette sage bằng navy/cobalt, bỏ globe trang trí; hero ảnh cảng hàng thật; demo chuyển ngành có thể thao tác và tải CSV mẫu; form gọn; pricing có tháng/năm; điều hướng mobile thật.
- Avoid: số liệu, đánh giá khách hàng hay buyer xác minh không có bằng chứng; chữ tí hon; panel trang trí lấn át sản phẩm; ngụ ý ảnh cảng là khách hàng hay địa điểm vận hành.

Người dùng đã yêu cầu rõ thiết kế lại sau khi không chấp nhận bản trước; yêu cầu này cho phép thay đổi bố cục/visual theo skill. Không thêm gate duyệt thiết kế.

Ảnh minh họa container: Unsplash photo-1494412519320-aa613dfb7738, lưu local. Font Be Vietnam Pro (Google Fonts, SIL OFL), lưu local, không có CDN font request ở production.

## Thành phần và kiểm chứng

LandingPage: header/hero/form/workflow/FAQ/footer. PartnerPreview: bộ ví dụ rõ là giả lập, chi tiết doanh nghiệp, tải CSV. LandingPricing: catalog public, trạng thái tải/lỗi, chọn tháng/năm, liên kết billing thật.

Before/After và aria snapshot: `.playwright-cli/maps-redesign/`. Kiểm tra desktop 1440, tablet 768, mobile 375; demo/filter/detail/download, form validation, truyền query, CTA billing, keyboard/focus, axe, không tràn ngang. Không gửi yêu cầu scrape hoặc thanh toán thật trong QA.

## Selected direction — concept 1 (2026-10-27)

User selected displayed image 1, unambiguously mapped to `concepts/landing-01-orange-trade.png`. Implemented warm ivory/orange export composition with existing Lead Finder identity. Product Design image-to-code/design-qa applied. User authorized Playwright checks explicitly. Icon library: Tabler (`@tabler/icons-react`), selected for the target's fine architectural outline icons. New asset made by built-in Image Gen: `public/landing/trade-hero-orange.png`; transparent revision consumed by homepage: `public/landing/trade-hero-orange-cutout.png`.

Asset prompt summary: reproduce the selected right-side hero only, navy ship, orange containers, blue trade-route globe, distant cranes/plane, foreground coffee sacks and fruit crates, warm ivory environment; no UI/headline. Revision removed only outer ivory into genuine alpha, preserving scene and lighting. Original and transparent revision retained locally in public/landing. No screenshot raster used as the live page.

Homepage uses real HTML text, functional search form and sample controls; pricing API and /app flow unchanged. See project-root `design-qa.md` for same-size source/implementation comparison and verification.
