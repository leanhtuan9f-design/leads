# Kiểm kê chuẩn bị Kho doanh nghiệp: Maps + Customs + Danh bạ

Ngày: 2026-10-28 UTC. Trạng thái: **hoàn tất bước 1 — kiểm kê chỉ đọc**.
Người dùng đã đồng ý phương án xây hồ sơ doanh nghiệp dùng chung, giữ dữ liệu nguồn,
tách doanh nghiệp/chi nhánh, có duyệt và hoàn tác liên kết. Tài liệu này chốt kết quả
kiểm kê và thiết kế cho bước tiếp theo; chưa phải tính năng kho đã triển khai.

## Kết luận từ dữ liệu thật

Nên xây lớp `companies.db` riêng để tìm kiếm và liên kết ba nguồn. Không dùng tên,
website hoặc số điện thoại đơn lẻ làm khóa doanh nghiệp. Hiện chưa có cơ sở để tự
động gộp hàng loạt. Lợi ích ban đầu của kho là mở rộng độ phủ và tập hợp bằng chứng,
không phải giảm số lượng hồ sơ bằng mọi cách.

- Maps tập trung ở Mỹ và Trung Quốc; danh bạ tập trung ở Maldives, UAE, Ấn Độ và Mỹ.
  Hai tập chưa có mức phủ đồng đều, nên độ giao thấp không chứng minh dữ liệu sai.
- 95 cặp Maps–buyer Customs khớp tên/quốc gia trong phép đối chiếu này, chưa có
  bằng chứng liên hệ hoặc địa chỉ trùng đủ để nâng mức tin cậy.
- 4 cặp Maps–danh bạ có tên chuẩn hóa, quốc gia và hostname trùng, không có ứng viên
  cạnh tranh trong phép đối chiếu. Đây là ứng viên ưu tiên duyệt, chưa xác minh pháp nhân.
- Nhiều domain trùng thuộc chuỗi/tập đoàn có nhiều điểm Maps. Liên kết công ty với
  chi nhánh phải thể hiện bằng quan hệ, không xóa các địa điểm trùng domain.
- Phần lớn buyer từ bảng xếp hạng thiếu quốc gia; phải giữ unknown, không lấy quốc
  gia của supplier, thư mục hoặc người dùng làm quốc gia buyer mà không có căn cứ.

## Phạm vi và tính nhất quán

Nguồn production được mở bằng SQLite `mode=ro`, `PRAGMA query_only=ON` và sao chụp
bằng SQLite backup API. Mỗi DB có snapshot nhất quán riêng; hai snapshot không phải
một transaction chung. Không copy riêng `.db` khi WAL đang chạy, không import module
backend có migration hoặc startup scheduler.

| Snapshot | Bắt đầu UTC | Kết thúc UTC | Kiểm tra |
|---|---|---|---|
| `cache.db` | 01:25:15 | 01:25:16 | `PRAGMA quick_check = ok` |
| `customs.db` | 01:25:16 | 01:25:21 | `PRAGMA quick_check = ok` |

Thư mục làm việc riêng: `/tmp/leads-company-audit-20261028/`, quyền `0700`, file
`0600`. Có `cache.db`, `customs.db`, `snapshot.json`, `audit.py`, `summary.json`,
`candidates.csv`, `priority-review.csv`. CSV chứa tên/ID nguồn và tín hiệu ghép,
không xuất email/điện thoại; bảo vệ chuỗi có thể kích hoạt công thức bảng tính.
Không đưa snapshot hay danh sách hồ sơ vào Git hoặc thư mục public. `/tmp` là nơi
lưu tạm; báo cáo tổng hợp này là tài liệu bền vững, không bảo đảm artifact tạm tồn tại mãi.

SHA-256 snapshot:

```text
cache.db   128fe0d545bddcb30a7dbecf77b8f09307c0e126edcc291ec89acd873fa60dd5
customs.db 45d190d5bf90e7236aea596742b3888b488f5c025e81ed155a7f37cc933f7a0f
```

Các số dưới đây là snapshot tại thời điểm trên, không phải số realtime.

## Kiểm kê nguồn

| Loại bản ghi | Số lượng | Đơn vị thực tế |
|---|---:|---|
| Maps `places` | 43.388 | Địa điểm, chưa phải pháp nhân |
| `customs_shipments` | 92.746 | Dòng hàng/vận đơn nguồn |
| `customs_rankings` | 61.646 | Dòng xếp hạng: 55.716 buyer, 5.930 supplier |
| `customs_market` | 2.726 | Dòng thống kê tổng hợp, không phải doanh nghiệp |
| `directory_entities` | 65.380 | Hồ sơ danh bạ, chưa loại trùng pháp nhân |
| `customs_files` | 2.210 | Nhật ký đường dẫn nguồn và marker migration |

Không cộng các dòng trên để công bố tổng số doanh nghiệp.

| Chất lượng trường | Maps | Danh bạ |
|---|---:|---:|
| Có email đúng mẫu cú pháp | 3.462 | 18.620 |
| Có trường điện thoại | 30.128 | 21.148 |
| Có trường website | 20.343 | 3.769 |
| Có ứng viên domain riêng từ website/email | 19.913 | 15.639 |
| Có địa chỉ sau chuẩn hóa | 42.353 | 15.904 |
| Thiếu quốc gia hợp lệ theo bộ ISO local | 1.877 | 4.176 |
| Nhóm tên chuẩn hóa chặt + quốc gia có nhiều bản ghi | 1.448 | 4.304 |

Một Maps record không có tên sau chuẩn hóa; không có JSON Maps hỏng trong snapshot.
Các con số có liên hệ chỉ phản ánh cú pháp/độ đầy đủ, không xác nhận liên hệ còn hoạt động.
Domain riêng là heuristic dựa danh sách loại trừ hiện có; danh sách chưa đầy đủ,
ví dụ `email.com` còn xuất hiện. Không dùng thống kê này làm bằng chứng sở hữu domain.

Top quốc gia Maps: US 19.367, CN 17.695, PH 1.242, JP 700, AU 698.
Top quốc gia danh bạ: MV 15.192, AE 13.581, IN 12.517, US 12.032, NL 2.074.
15.192 bản ghi MV đều đến từ `Data_Maldives/Company-List_2025-02-17.xlsx`;
đây là nguồn gốc nhãn quốc gia, chưa phải xác minh từng doanh nghiệp.

### Các điểm Customs phải xử lý khi xây kho

- 34.435/55.716 dòng buyer ranking thiếu quốc gia (61,8%); supplier ranking thiếu
  4.091/5.930. Không ghép tự động các dòng này theo tên vào hồ sơ đã có quốc gia.
- Một số mã quốc gia không nằm trong bộ ISO local: danh bạ DY/FX/YU tổng 64 dòng;
  rankings FX 83 dòng; shipments BC/FX/LE/NY/RD/ZZ tổng 2.263 dòng. Giữ mã gốc,
  đánh dấu cần chuẩn hóa; không đoán lại quốc gia. UK được alias GB chỉ trong audit.
- 2.969 dòng shipments trống quốc gia buyer, 24 dòng trống buyer_norm.
- 8.099 hồ sơ danh bạ có `confidence=low` từ luồng trích tài liệu; ưu tiên duyệt.
- 6.147 dòng buyer ranking và 56 supplier ranking có sản phẩm suy ra. Giữ nhãn
  `inferred`, không nâng thành sản phẩm đã xác minh của doanh nghiệp.
- 6.840/92.746 dòng shipments có mã B/L; 834 mã B/L xuất hiện nhiều dòng, tổng
  4.929 dòng. Có thể là nhiều dòng hàng hợp lệ, không tự xóa trùng theo B/L.
- Ngày shipments trong snapshot từ 2022-01-01 đến 2024-08-31. Không mô tả dữ liệu này
  thành giao dịch mới nhất của toàn thị trường hoặc nhu cầu hiện tại.
- 1.641 nhóm buyer_norm + quốc gia xuất hiện ở cả shipments và rankings theo bộ
  chuẩn hóa nguồn. Cần tách số liệu hai nguồn, không cộng transactions/USD rồi coi
  đó là số giao dịch/kim ngạch độc lập đã loại trùng.
- Schema shipments không có quốc gia supplier riêng. Audit không tự gán VN cho
  mọi supplier; tên nhãn UI “Nhà cung cấp VN” không thay thế dữ liệu quốc gia.

## Phương pháp tìm ứng viên

1. Chuẩn hóa Unicode NFKD/casefold, dấu, khoảng trắng, HTML entity và dấu câu;
   giữ chữ Unicode. Có bản tên chặt và bản tên bỏ một số hậu tố pháp lý.
2. Chỉ tạo cặp có cùng quốc gia hợp lệ; UK alias GB. Không suy quốc gia bị thiếu.
3. Khối ứng viên bằng tên chặt/tên bỏ hậu tố, hoặc hostname/email/số quốc tế trùng.
   Số điện thoại phải có `+` hoặc `00`, không đoán mã vùng từ số nội địa.
4. Hostname khớp chính xác, bỏ `www`; loại các nền tảng xã hội/directory phổ biến
   và provider email đã biết. Không tự cắt domain bằng hai nhãn cuối, tránh sai `.co.uk`.
5. Tên khớp chặt dài ít nhất 5 ký tự + liên hệ/domain/địa chỉ trùng là nhóm có thêm
   bằng chứng. Bản ghi low-confidence vẫn thuộc hàng đợi duyệt riêng.
6. Đếm số ứng viên cạnh tranh ở cả hai đầu; không ghép bắc cầu A–B–C.

Buyer được gom sơ bộ theo tên bỏ hậu tố + quốc gia thành 31.118 **nhóm ứng viên**,
trong đó 17.617 nhóm chưa có quốc gia hợp lệ. Đây không phải số doanh nghiệp đã xác
minh. Tên/địa chỉ đại diện lấy từ nhóm nguồn nên kết quả chỉ phục vụ kiểm kê; khi
xây kho phải giữ từng alias và từng địa chỉ gốc, không dùng đại diện để quyết định gộp.

Chưa đo fuzzy matching, chuyển tự Trung/Nhật/Hàn, mã đăng ký pháp nhân, quan hệ tập
đoàn xuyên quốc gia hoặc số giao dịch độc lập. Kết quả không phải toàn bộ số trùng.

## Kết quả đối chiếu

| Cặp nguồn | Cặp ứng viên | Bản ghi đầu trái | Bản ghi/nhóm đầu phải | Cặp có cạnh tranh | Cặp có thêm bằng chứng, không cạnh tranh |
|---|---:|---:|---:|---:|---:|
| Maps – Danh bạ | 723 | 336 | 307 | 673 | 4 |
| Maps – Buyer Customs | 95 | 95 | 61 | 41 | 0 |
| Buyer Customs – Danh bạ | 344 | 234 | 344 | 179 | 0 |

Tổng 1.162 cặp ứng viên; không tương đương 1.162 doanh nghiệp hoặc liên kết đã xác nhận.

Maps–Danh bạ gồm 8 cặp có thêm bằng chứng, 54 cặp tên, 187 cặp chỉ liên hệ và 474
cặp có ít nhất một đầu low-confidence. Chỉ 4/8 cặp có thêm bằng chứng không cạnh tranh.
Domain `hmart.com`, `homedepot.com`, `costco.com`, `nike.com` tạo nhiều cặp do các
địa điểm cùng chuỗi; domain trùng không có nghĩa các địa điểm là cùng một chi nhánh.

Bốn ứng viên ưu tiên duyệt đều ở US:

| Tên | Hostname trùng |
|---|---|
| Global Best Produce | gbpusa.com |
| Purvey'd Corporation | purveyd.com |
| Vega Produce LLC | vegaproduce.com |
| Century Farms International, Inc. | centuryfarms.net |

Không truy cập website hoặc xác minh bên ngoài trong audit này. Chưa có cặp nào
được gộp vào production.

## Thiết kế triển khai đã điều chỉnh sau kiểm kê

### Kho và nguồn

- Thêm `companies.db`; giữ nguyên DB nguồn và bộ chạy tự động Maps.
- Khởi tạo hồ sơ tạm theo bản ghi/thực thể nguồn; không đặt UNIQUE tên + quốc gia
  trên `companies`. Tên/quốc gia chỉ là chỉ mục tìm ứng viên.
- `company_locations` chứa từng Maps place_id, không dùng place_id làm ID pháp nhân.
- `company_source_links` có UNIQUE `(source, source_key, entity_role)`; một vận đơn
  có thể liên kết buyer và supplier khác nhau. Dùng `dedupe_key` ổn định ở Customs,
  không chỉ dựa rowid có thể thay đổi sau reimport.
- `company_contacts` lưu giá trị gốc, chuẩn hóa, nguồn, ngày thấy đầu/cuối,
  độ tin cậy và trạng thái xác minh. Nhiều giá trị xung đột cùng tồn tại.
- Lưu bản sao bằng chứng tối thiểu và hash/revision nguồn trong kho; hồ sơ và bằng
  chứng không biến mất khi Maps purge cache. Tách `observed_at`, `imported_at` và
  ngày giao dịch. Không dùng last_seen Maps thay ngày vận đơn.
- Supplier chưa có nước vẫn được lưu với country unknown. Market aggregates nằm
  ở bảng thống kê, không đưa vào danh sách doanh nghiệp.

### Liên kết và hoàn tác

- Phiên bản đầu **không tự gộp chéo nguồn**. Sinh hàng đợi với lý do, phiên bản quy
  tắc, tín hiệu trùng, tín hiệu xung đột và số ứng viên ở hai đầu.
- Có trạng thái pending/approved/rejected; lưu người duyệt, thời điểm và lý do.
  Duyệt liên kết phải thực hiện trong transaction và có sự kiện hoàn tác.
- Tách hành động “cùng doanh nghiệp” khỏi “chi nhánh của” hoặc “cùng tập đoàn”.
- Đổi dữ liệu nguồn làm thay bằng chứng thì đánh dấu cần duyệt lại; không ghi đè
  quyết định đã duyệt. Lưu cặp bị từ chối để lần sync sau không đề nghị lại vô hạn.
- Chỉ cân nhắc tự liên kết sau khi đánh giá tập cặp đã duyệt; bốn ứng viên audit
  hiện tại quá ít để đưa ra một tỷ lệ chính xác hoặc ngưỡng tự động đáng tin cậy.

### Đồng bộ, API và giao diện

- Import theo lô, checkpoint riêng từng nguồn, upsert theo khóa nguồn; chạy lại
  không tăng hồ sơ/contacts/facts trùng. Chỉ tiến checkpoint sau transaction thành công.
- DB Customs chưa có updated_at từng dòng: không dùng MAX(id) làm checkpoint duy
  nhất; cần hash nội dung/full reconciliation để bắt UPDATE và reimport ID cũ.
- Có khóa tránh hai sync đồng thời, giới hạn tài nguyên và job log. Không chạy
  import nặng trong request HTTP hoặc gây gián đoạn scheduler Maps.
- API và UI Kho doanh nghiệp ban đầu admin-only: danh sách phân trang, lọc nguồn,
  nước/thành phố, vai trò, sản phẩm/HS, liên hệ và trạng thái bằng chứng/liên kết.
- Chi tiết: Tổng quan, Liên hệ, Địa điểm, Giao dịch, Nguồn dữ liệu. Hiển thị riêng
  dòng vận đơn, thống kê ranking và sản phẩm suy ra; không cộng USD chồng lặp.
- Thống kê phân biệt số hồ sơ doanh nghiệp tạm/đã duyệt, số địa điểm và số bản ghi
  nguồn. Giữ thống kê homepage Maps như hiện tại cho tới khi đổi contract rõ ràng.
- Lưu stage/notes CRM trong bảng riêng theo `(workspace_id, company_id)`, không
  ghi vào dữ liệu dùng chung hoặc importer. Không nhập JSON Lead demo vào kho thật.
- Bổ sung liên hệ bằng Maps chỉ qua job có quota/budget và lưu provenance; tìm thấy
  tên tương tự không tự xác nhận là buyer Customs. Giữ nguyên stopped/manual,
  khả năng mở rộng thành phố, giới hạn sâu 3 và 600 runs/task của planner hiện tại.

## Trạng thái và nghiệm thu

| Giai đoạn | Trạng thái |
|---|---|
| 1. Snapshot, kiểm kê, tìm ứng viên, chốt quy tắc | Hoàn tất trong tài liệu này |
| 2. Schema kho, importer và hàng đợi duyệt/hoàn tác | Chưa triển khai |
| 3. API/giao diện kho admin | Chưa triển khai |
| 4. Job bổ sung dữ liệu chéo nguồn | Chưa triển khai |
| 5. CRM theo workspace/tài khoản | Chưa triển khai |

Kiểm chứng đã làm: quick_check hai snapshot, tổng số cặp theo nguồn/tier khớp CSV,
tổng quốc gia khớp tổng records, bốn cặp ưu tiên khớp bộ lọc, đối chiếu source/schema.
Không chạy build/test ứng dụng vì không sửa code ứng dụng; không restart, deploy,
push GitHub hoặc thay DB production.

Nghiệm thu bắt buộc khi hiện thực: import lặp không tăng trùng; bắt được cập nhật
nguồn với ID giữ nguyên; không gộp chuỗi nhiều chi nhánh; giữ unknown country;
không cộng chồng ranking/shipment; hoàn tác khôi phục liên kết; purge nguồn không
làm mất hồ sơ; giữ stage/notes; user/trial không đọc được API kho admin.
