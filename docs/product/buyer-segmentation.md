# Định nghĩa tệp khách hàng xuất khẩu

Ngày kiểm tra: 2026-10-27. Phạm vi: kho Maps thật (`places`), không dùng dataset demo của module Lead làm bằng chứng.

## Tách bốn khái niệm

1. **Nhãn ngành nguồn**: mô tả lĩnh vực/loại địa điểm do nguồn cung cấp, giữ nguyên để đối chiếu. Không phải kết luận về vai trò mua.
2. **Vai trò kinh doanh sơ bộ**: suy từ ngành chính/phụ. Là tín hiệu cần thẩm định, không phải chứng nhận.
3. **Phù hợp với sản phẩm**: cần đối chiếu sản phẩm/HS, phân khúc, thị trường, quy mô, tiêu chuẩn và đầu vào của người mua. Không suy từ truy vấn đã tìm ra hồ sơ.
4. **Hoạt động nhập khẩu và nhu cầu mua**: cần bằng chứng riêng, có nguồn, thời điểm, phạm vi sản phẩm và pháp nhân. Đã nhập khẩu trong quá khứ không chứng minh đang cần mua hoặc sẵn sàng mua từ Việt Nam.

## Các tệp sơ bộ đã triển khai

| Tệp | Điều kiện từ nhãn ngành chính/phụ | Cách sử dụng |
|---|---|---|
| Có nhãn nhập khẩu — chưa xác minh | Nhãn rõ nhà nhập khẩu/xuất nhập khẩu hoặc tương đương tiếng Anh được hỗ trợ | Ưu tiên xác minh website chính thức, pháp nhân và sản phẩm; chưa gọi là importer verified |
| Bán buôn / phân phối — cần thẩm định | Có nhãn bán buôn/phân phối | Kênh có thể mua nội địa; cần xác định trực tiếp nhập khẩu hay mua qua trung gian |
| Chợ / bán lẻ — tệp tham khảo | Chợ/wholesale market là ngành chính, hoặc chỉ có tín hiệu bán lẻ | Điểm bán/chợ không mặc nhiên là một đơn vị mua; tìm từng thương nhân hoặc công ty quản lý phù hợp |
| Sản xuất — cần xác định đầu vào | Có nhãn sản xuất, không có tín hiệu ưu tiên ở trên | Chỉ phù hợp khi sản phẩm xuất khẩu là đầu vào thực tế của nhà máy; có thể là đối thủ nếu sản xuất cùng sản phẩm |
| Khác / chưa đủ thông tin | Nhãn chung, dịch vụ, thiếu dữ liệu hoặc ngôn ngữ chưa hỗ trợ | Giữ chưa xác định, không ép thành khách mua |

Mỗi hồ sơ thuộc một tệp để tổng không trùng: dịch vụ môi giới hải quan/logistics → khác; nhãn nhập khẩu rõ → tín hiệu nhập khẩu; chợ là nhãn chính → tham khảo; tiếp theo bán buôn/phân phối, sản xuất, bán lẻ, khác. Đây là quy tắc bảo thủ có phạm vi từ vựng giới hạn, không cam kết phân loại chính xác 100%. Không đoán nhãn từ tên công ty, tên miền hoặc từ khóa tìm kiếm. Dữ liệu cũ không bị sửa/xóa.

## Điều kiện để gọi là nhà nhập khẩu đã xác minh

Cần cơ chế lưu bằng chứng, chưa có trong kho Maps hiện tại:

- Pháp nhân xác định và khớp đúng hồ sơ doanh nghiệp, quốc gia và website.
- Nguồn sơ cấp chứng minh vai trò nhập khẩu: website chính thức tự công bố (ghi rõ là doanh nghiệp tự công bố), đăng ký/giấy phép phù hợp hoặc hồ sơ giao dịch nhập khẩu hợp pháp. Phân biệt mức bằng chứng; không coi các mức tương đương.
- URL/tài liệu nguồn, trích đoạn liên quan, ngày kiểm tra, sản phẩm liên quan, người/phương pháp kiểm tra và trạng thái còn hiệu lực.
- Bằng chứng nhu cầu mua hiện tại (RFQ, trao đổi với bộ phận mua hàng…) là trạng thái riêng; email/điện thoại/MX hoặc rating không đủ.

Không công bố “0 nhà nhập khẩu đã xác minh”: hiện **chưa đánh giá**, không phải đã kiểm tra và không tìm thấy.

## Kết quả kiểm tra kho

Snapshot 2026-10-27: nhóm Chợ bán buôn nông sản có 10.406 hồ sơ, trong đó 10.399 ở CN; 7 có website, 2 có email. Các truy vấn nguồn gồm `produce wholesaler` và `农产品批发市场` ở nhiều thành phố/quận. Đây là thiên lệch bao phủ do từ khóa rộng và tìm sâu, không phải bằng chứng có nhiều nhà nhập khẩu phù hợp. Các con số là snapshot, không dùng làm hiện trạng lâu dài.

Nhóm Cửa hàng bán buôn có 897 hồ sơ với nhiều ngành phụ (thực phẩm, ô tô, nhựa, đồ điện tử...). Không thể gán chung vào tệp mua nông sản. 574 có website và 108 có email chỉ phản ánh khả năng liên hệ.

## Cách thu thập mới

Prompt bắt buộc ưu tiên importer đúng sản phẩm, tiếp theo nhà phân phối chuyên ngành/nhà máy có đầu vào phù hợp; không mặc định lấy chợ, bán lẻ, nhà hàng, khách sạn cho mục tiêu tìm người nhập khẩu. Cache gợi ý user đổi version để không tái dùng gợi ý cũ. Quy tắc prompt không phải validator bảo đảm; cần kiểm định kết quả thực tế. Không sửa hoặc chạy lại task cũ, không tự mở task stopped/manual, giữ cơ chế mở rộng tìm sâu.

## Cách thể hiện với khách

Homepage giữ top nhãn ngành gốc và thêm phân tệp; không gọi tổng kho là tổng nhà nhập khẩu. Drawer ghi rõ vai trò sơ bộ và chưa xác minh. Điểm hồ sơ/hot/warm chỉ là heuristic từ liên hệ, rating, review, claimed; không phải xác suất nhập khẩu/mua hàng.

Nguồn định nghĩa: UNSD ISIC Rev.4 Division 46 https://unstats.un.org/unsd/classifications/Econ/Detail/EN/27/46 — bán buôn bao gồm cả thương mại nội địa và quốc tế, vì vậy bán buôn không tự đồng nghĩa nhập khẩu.
