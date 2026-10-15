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
6. **Tự động commit + push + deploy khi hoàn thành nhiệm vụ** (người dùng đã cho phép thường trực). Thứ tự:
   1. Cập nhật `/home/claude/repo-maps.md` (quy tắc 2).
   2. Kiểm tra: `npx tsc --noEmit` phải sạch, rồi `/opt/maps/deploy.sh` (git pull --ff-only + build) phải thành công. Nếu lỗi → **dừng, không commit/push**, báo lỗi cho người dùng.
   3. `git add` chỉ các file thuộc nhiệm vụ (không `git add -A`; không bao giờ commit `.env*`, secret, `node_modules`, `dist`).
   4. `git commit` với thông điệp ngắn gọn, mô tả rõ thay đổi, kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
   5. `git push origin main`. Cấm `--force`. Nếu push bị từ chối (remote đi trước) → pull --ff-only/rebase, build lại, rồi push; xung đột thì dừng và báo.
   6. Ghi hash commit vào nhật ký `repo-maps.md`, rồi báo người dùng: commit, trạng thái push, trạng thái deploy.
   Chỉ áp dụng cho nhiệm vụ thay đổi code/cấu hình của repo. Câu hỏi, đọc/giải thích thì không commit. Các thao tác khác ngoài repo này (xóa dữ liệu, đổi DNS/SSL/nginx của site khác) vẫn phải hỏi trước.
