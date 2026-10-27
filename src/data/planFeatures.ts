/** Customer-facing benefits supported by the current application. */
export const planFeatures = {
  BASIC: [
    'Chọn 1 quốc gia để tìm kiếm',
    '1 tìm kiếm chạy cùng lúc, không giới hạn số lượt tìm',
    'Tìm doanh nghiệp theo ngành hàng và thị trường',
    'Email, điện thoại, website và địa chỉ khi có',
    'Lọc danh sách theo thông tin liên hệ',
    'Lưu và đồng bộ danh sách giữa các thiết bị',
    'Xuất CSV để mở bằng Excel hoặc nhập vào CRM',
  ],
  ADVANCED: [
    'Không giới hạn quốc gia để tìm kiếm',
    'Không giới hạn lượt tìm kiếm',
    'Tìm doanh nghiệp theo ngành hàng và thị trường',
    'Email, điện thoại, website và địa chỉ khi có',
    'Lọc, lưu và đồng bộ danh sách giữa các thiết bị',
    'Xuất CSV để mở bằng Excel hoặc nhập vào CRM',
    'Thống kê danh sách theo ngành và thành phố',
    'Mẫu thư giới thiệu để tiếp cận doanh nghiệp',
  ],
} as const;
