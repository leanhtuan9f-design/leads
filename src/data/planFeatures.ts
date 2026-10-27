/** Customer-facing benefits supported by the current application (capabilities only, no numeric limits). */
export const planFeatures = {
  BASIC: [
    'Tìm doanh nghiệp theo ngành hàng và thị trường',
    'Email, điện thoại, website và địa chỉ khi có',
    'Lọc danh sách theo thông tin liên hệ',
    'Lưu và đồng bộ danh sách giữa các thiết bị',
    'Xuất CSV để mở bằng Excel hoặc nhập vào CRM',
  ],
  ADVANCED: [
    'Tìm doanh nghiệp theo ngành hàng và thị trường',
    'Email, điện thoại, website và địa chỉ khi có',
    'Lọc, lưu và đồng bộ danh sách giữa các thiết bị',
    'Xuất CSV để mở bằng Excel hoặc nhập vào CRM',
    'Thống kê danh sách theo ngành và thành phố',
    'Mẫu thư giới thiệu để tiếp cận doanh nghiệp',
  ],
} as const;

/** Giới hạn của một gói đúng như admin cấu hình (0 = không giới hạn). */
export type PlanLimits = { dailyRefresh?: number; maxCountries?: number; maxConcurrentSearches?: number; dailySearches?: number };

const num = (value: number) => value.toLocaleString('vi-VN');

/**
 * Các dòng giới hạn hiển thị cho khách, sinh trực tiếp từ cấu hình gói của admin để bảng giá không bao giờ lệch cấu hình.
 * Không nhắc số địa điểm mới/ngày (theo yêu cầu bỏ dòng này khỏi bảng giá).
 */
export function planLimitLines(plan: PlanLimits | undefined): string[] {
  if (!plan) return [];
  const lines: string[] = [];
  lines.push((plan.maxCountries ?? 0) > 0 ? 'Chọn 1 hoặc nhiều quốc gia, giá tính theo số quốc gia' : 'Không giới hạn quốc gia để tìm kiếm');
  lines.push((plan.maxConcurrentSearches ?? 0) > 0 ? `${num(plan.maxConcurrentSearches!)} tìm kiếm chạy cùng lúc` : 'Không giới hạn số tìm kiếm chạy cùng lúc');
  lines.push((plan.dailySearches ?? 0) > 0 ? `${num(plan.dailySearches!)} lượt tìm kiếm mỗi ngày` : 'Không giới hạn lượt tìm kiếm');
  if (typeof plan.dailyRefresh === 'number') lines.push(`${num(plan.dailyRefresh)} lượt cập nhật dữ liệu mỗi ngày`);
  return lines;
}

/** Toàn bộ quyền lợi hiển thị: dòng giới hạn theo cấu hình, rồi các chức năng. */
export const planBenefits = (key: keyof typeof planFeatures, plan: PlanLimits | undefined): string[] => [...planLimitLines(plan), ...planFeatures[key]];
