# Quy tắc bắt buộc cho AI làm việc trong repo này

Bản đồ logic dự án nằm ở **`/home/claude/repo-maps.md`**.

1. **Trước khi bắt đầu mọi nhiệm vụ**: đọc toàn bộ `/home/claude/repo-maps.md`. Không bắt đầu sửa code khi chưa đọc. Nếu nội dung file lệch với code thực tế, tin code và sửa file.
2. **Khi hoàn thành nhiệm vụ** (trước khi báo xong cho người dùng): cập nhật `/home/claude/repo-maps.md`:
   - sửa các mục kiến trúc/luồng/model/component bị ảnh hưởng;
   - thêm 1 dòng vào bảng "Nhật ký thay đổi" (ngày, nhiệm vụ, thay đổi, file, commit);
   - cập nhật "Commit tham chiếu" ở đầu file nếu có commit mới;
   - nếu xử lý một mục trong "Hướng nâng cấp" hoặc "nợ kỹ thuật" thì đánh dấu/xóa mục đó.
3. **Khi bắt đầu nhiệm vụ lớn**: ghi một dòng "đang làm" vào nhật ký (trạng thái `ĐANG LÀM`), đổi thành kết quả khi xong.
4. Thay đổi hạ tầng (nginx, SSL, deploy, env) cũng phải ghi vào mục 8 và nhật ký.
5. Không ghi secret (API key, mật khẩu) vào `repo-maps.md`.
6. Sau khi sửa code: `/opt/maps/deploy.sh` để build/deploy; chỉ commit/push khi người dùng yêu cầu.
