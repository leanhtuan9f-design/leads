# Kho doanh nghiệp — phiên bản production đầu tiên

## Phạm vi

Admin mở `/companies/` hoặc nút **Kho doanh nghiệp** trên header. Kho tập hợp Maps,
danh bạ, buyer/supplier vận đơn và xếp hạng. Đây là hồ sơ tạm từ nguồn; liên kết
chéo nguồn chỉ được gộp khi admin duyệt. Không công bố số hồ sơ tạm thành số pháp
nhân hoặc số importer đã xác minh.

- Lọc tên, quốc gia/thành phố, vai trò, nguồn, sản phẩm/HS, liên hệ và hồ sơ đã liên kết.
- Chi tiết có các hồ sơ nguồn/địa điểm, liên hệ chưa xác minh, số dòng riêng từng
  loại bằng chứng và JSON gốc có file, ID nguồn, ngày giao dịch, cờ sản phẩm suy ra.
- Duyệt/từ chối/hoàn tác yêu cầu lý do, lưu actor và thời điểm. Domain chỉ bổ trợ
  tên/quốc gia. Không gộp theo domain đơn lẻ hoặc tự gộp chuỗi nhiều chi nhánh.
- Chặn gộp bắc cầu: mỗi quyết định gộp chỉ áp dụng hai hồ sơ chưa thuộc nhóm nào.
  Muốn thay quyết định phải hoàn tác trước. Chưa hỗ trợ nhóm hơn hai hồ sơ trong v1.
- Bằng chứng đổi sau quyết định được đánh dấu cần xem lại; duyệt màn hình cũ bị chặn
  bằng revision. Không tự hủy liên kết đã duyệt hoặc ghi đè từ chối.

Chưa triển khai job tự tìm liên hệ Maps cho buyer, quan hệ chi nhánh/tập đoàn do
admin định nghĩa, CRM stage/notes theo workspace hay mở kho cho khách trả phí.
Giữ module Lead demo độc lập. Màn hình Customs và các API/kho Maps cũ vẫn hoạt động.

## Lưu trữ và định danh

`/var/lib/maps-data/companies.db` (override `COMPANY_DB_PATH`), SQLite WAL, riêng với
`cache.db` và `customs.db`. Sáu bảng: companies, company_facts, company_contacts,
company_candidates, company_reviews, company_sync_runs và các index hỗ trợ.

- Maps: profile key = place_id. Danh bạ: profile key = dedupe_key.
- Shipments/rankings: bucket tạm riêng từng nguồn theo role + tên chuẩn hóa chặt +
  country token gốc. Không bỏ hậu tố pháp lý. Bucket chưa xác minh pháp nhân.
- Fact key = SHA256(source, dedupe_key/place_id, role), không dựa rowid Customs.
  Shipment có hai fact buyer/supplier, nên số facts không bằng số shipment rows.
- Snapshot JSON nguồn + content_hash + first_imported_at/imported_at + last_run.
  Source first_seen/last_seen Maps nằm trong JSON, ngày giao dịch lưu riêng.
- Không xóa facts khi nguồn mất dòng hoặc Maps dọn cache; giữ bằng chứng lịch sử.
  `last_run` là lần cuối thấy fact; chưa có bộ lọc historical/current trên UI v1.
- Đồng bộ cùng fact ID bắt được UPDATE giữ nguyên ID; contacts hiện tại của fact
  được thay khi nguồn đổi. Payload cũ trước UPDATE chưa có version history riêng.
- Khi source đổi tên bucket, fact chuyển sang profile tạm mới; profile cũ có thể
  còn để giữ lịch sử quyết định. V1 chưa tự gộp/dọn các profile rỗng này.
- Country alias UK→GB, chỉ nhận ISO alpha-2 hợp lệ; giữ raw country trong payload.
  Supplier vận đơn chưa có cột quốc gia nên normalized country trống, không đoán VN.
- `merged_into` là liên kết có thể hoàn tác, không xóa hồ sơ/fact/contact nguồn.

## Đồng bộ

```bash
python3 server/company-sync.py
# Dùng DB tạm khi thử:
python3 server/company-sync.py --maps /tmp/maps.db --customs /tmp/customs.db --output /tmp/companies.db
systemctl status maps-company-sync.timer
journalctl -u maps-company-sync.service -n 20 --no-pager
```

Source connections chỉ đọc (`mode=ro`, query_only), transaction đọc nhất quán riêng
từng DB; không import backend có startup cleanup/migration. Reconcile toàn bộ nguồn
để bắt update ID cũ; commit mỗi 1.000 fact. `flock` ngăn sync đồng thời; khóa được
kernel giải phóng khi worker chết, run đang running được đánh dấu interrupted ở lần sau.
Các batch đã commit còn lại khi lỗi; UI hiển thị trạng thái run, retry tiếp tục upsert
không tăng trùng. last_run/counts phục vụ kiểm tra, không dùng MAX(id) làm checkpoint.

Timer chạy mỗi giờ, bắt đầu khoảng 10 phút sau boot, có random delay tối đa 2 phút.
Worker riêng Nice=10, I/O idle, MemoryMax=240M, timeout 20 phút. Không chạy trong
request HTTP, không sửa planner/worker Maps. API giữ bộ nhớ nhỏ, truy vấn có phân trang.

Candidate v1: cùng tên Unicode chuẩn hóa chặt và quốc gia hợp lệ, khác nguồn,
tên ít nhất 5 ký tự; domain exact hostname là tín hiệu bổ sung. Không fuzzy/loose-name
hay contact-only như audit, vì ưu tiên hàng đợi nhỏ và dễ giải thích. Vì vậy số cặp
production không so trực tiếp với 1.162 cặp audit. Provider email và platform phổ biến
được loại khỏi tín hiệu domain; danh sách vẫn là heuristic, không xác minh sở hữu.

## API và phân quyền

Tất cả route dùng requireAdmin thật của Maps, no-store; write đi qua Origin/CSRF
middleware hiện tại và body limit 32KB. User/trial bị 403, anonymous 401.

| Method | Route | Chức năng |
|---|---|---|
| GET | `/api/admin/companies/summary` | Thống kê hồ sơ/facts, run gần nhất, nước/sản phẩm |
| GET | `/api/admin/companies` | Danh sách, limit ≤100, offset và bộ lọc |
| GET | `/api/admin/companies/:id` | Hồ sơ/contacts và facts phân trang |
| GET | `/api/admin/companies/candidates?status=pending` | Hàng đợi pending/approved/rejected |
| GET | `/api/admin/companies/reviews/:id` | Lịch sử quyết định của candidate |
| POST | `/api/admin/companies/reviews/:id` | `{action,reason,revision}`; action approve/reject/undo |

Không đưa contacts/profiles ra endpoint public, không thay contract thống kê homepage.
Không cộng USD/transactions giữa ranking và shipment. Không đếm B/L thành giao dịch
độc lập vì một B/L có thể nhiều dòng hàng.

## Kiểm chứng và triển khai

- `node --test server/company-warehouse.test.mjs`: idempotency, source update giữ ID,
  Unicode, SQL filters, source purge, unknown country, manual review/undo/history,
  không gộp bắc cầu, revision stale, quyền route và pagination.
- `npx tsc --noEmit`, Vite build, syntax/diff-check, systemd unit verification.
- Nhập staging từ nguồn thật, kiểm tra counts/quick_check, browser desktop/mobile.
- `deploy.sh` cài thêm unit/timer và restart maps-api theo workflow có sẵn. Restart
  sẽ phục hồi auto runs đang chạy về pending theo cơ chế cũ; không tự mở stopped.
- Rollback ứng dụng về commit trước chỉ bỏ UI/API mới; companies.db độc lập vẫn giữ.
  Tắt timer mới nếu rollback. Không restore đè DB Maps/Customs đang thu thập.

Kết quả live, thời điểm snapshot, commit và trạng thái deploy ghi trong repo-leads.md.
