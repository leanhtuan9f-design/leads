/** Customer-facing benefits supported by the current application. */
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
