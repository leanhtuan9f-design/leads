export interface ModuleGuide {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  logicExplanation: string[];
  steps: string[];
  proTips: string[];
  fieldExplanations?: { name: string; desc: string }[];
}

export const MODULE_GUIDES: Record<string, ModuleGuide> = {
  scraper_config: {
    id: 'scraper_config',
    title: 'Bộ cấu hình & Khởi chạy cào dữ liệu (Scraper Engine)',
    subtitle: 'Cách thiết lập từ khóa, vị trí, độ sâu cào và cơ chế quét email từ website',
    tag: 'Thu thập dữ liệu',
    logicExplanation: [
      'Giao diện trực tiếp tách biệt thành 2 ô nhập chuẩn xác: [Ngành nghề / Dịch vụ] và [Địa điểm / Tọa độ GPS].',
      'Hỗ trợ cào theo Tọa độ GPS trực tiếp: Bạn có thể nhập cặp tọa độ ví dụ "21.0285, 105.8542" (Hà Nội) hoặc "10.7769, 106.7009" (TP.HCM) để hệ thống quét chính xác bán kính quanh vị trí mong muốn.',
      'Bộ cào mô phỏng kiến trúc Golang của gosom/google-maps-scraper: tự động phân tích truy vấn, truy xuất Google Maps Places API và mạng lưới vị trí địa lý.',
      'Cơ chế Deep Web Crawl: Tự động quét trang web chính thức của doanh nghiệp để bóc tách địa chỉ Email và các mạng xã hội (Facebook, Instagram, LinkedIn, X).',
      'Hỗ trợ chế độ Proxy xoay vòng (Rotating Proxy) giúp vượt giới hạn tần suất (Rate Limit) và đạt tốc độ trung bình 120 địa điểm/phút.'
    ],
    steps: [
      'Bước 1: Tại thanh cào trực tiếp ở đầu trang, nhập ô thứ nhất: [Ngành nghề / Dịch vụ] (Ví dụ: "Nha khoa", "Quán cafe", "Thầu xây dựng", "Khách sạn").',
      'Bước 2: Nhập ô thứ hai: [Địa điểm / Tỉnh thành] (Ví dụ: "Hà Nội", "Quận 1 TP.HCM") hoặc [Tọa độ GPS] (Ví dụ: "21.0285, 105.8542").',
      'Bước 3: Chọn số lượng địa điểm cần cào (10, 25, 50, 100).',
      'Bước 4: Nhấn nút màu xanh "⚡ Bắt đầu cào" và theo dõi dữ liệu được trích xuất và hiển thị trực tiếp lên bảng dữ liệu.'
    ],
    proTips: [
      'Mẹo 1: Bạn có thể sao chép kinh độ/vĩ độ từ Google Maps (dạng 21.0285, 105.8542) dán thẳng vào ô Địa điểm/Tọa độ để cào cực kỳ chuẩn xác khu vực mong muốn.',
      'Mẹo 2: Nếu cần cấu hình chuyên sâu (chọn loại Proxy, bật/tắt quét email, lọc số điện thoại), hãy nhấn nút "Tùy chọn nâng cao".'
    ]
  },
  deduplication_and_market_exhaustion: {
    id: 'deduplication_and_market_exhaustion',
    title: 'Cơ chế Chống cào trùng & Cách cào vét sạch >100 điểm tại một Thành phố',
    subtitle: 'Giải đáp chi tiết: Vì sao Google Maps chỉ trả về 20-25 điểm một lượt, cách không bị cào lặp lại và làm sao biết đã quét hết 100%',
    tag: 'Thuật toán Scraper cốt lõi',
    logicExplanation: [
      '1. VẤN ĐỀ VÌ SAO CHỈ RA 20-25 ĐIỂM (DÙ THỰC TẾ CÓ HƠN 100 ĐIỂM):',
      'Google Maps giới hạn kỹ thuật: Mỗi một lượt tìm kiếm theo khung nhìn bản đồ (Viewport), Google chỉ tải về khoảng 20-25 kết quả đầu tiên. Ngay cả khi bạn cuộn chuột hết cỡ, Google Maps cũng khống chế tối đa ~120 kết quả ở trung tâm rồi hiện thông báo "You\'ve reached the end of the list". Các cơ sở ở các quận ngoại thành hoặc ngõ ngách sẽ bị ẩn đi nếu không phóng to (zoom in) hoặc chia nhỏ truy vấn.',
      '',
      '2. LÀM THẾ NÀO ĐỂ KHÔNG BỊ CÀO LẠI (CƠ CHẾ CHỐNG TRÙNG LẶP - DEDUPLICATION):',
      'Mỗi địa điểm trên Google Maps đều có 3 mã định danh độc nhất: Mã địa điểm "place_id" (ví dụ: ChIJ...), Số điện thoại chuẩn hóa, và Tên + Địa chỉ.',
      'Khi bạn đã cào đợt 1 (ví dụ 25 phòng khám nha khoa tại Hà Nội), hệ thống đã lập chỉ mục (index) 25 địa điểm này vào bộ nhớ.',
      'Khi bạn cào đợt 2 (hoặc bấm "Cào tiếp +25 điểm"): Scraper sẽ kiểm tra tức thì từng địa điểm tìm thấy. Nếu địa điểm đó đã có trong danh sách -> Hệ thống tự động BỎ QUA (Skip duplicate), không tính vào số lượng cào mới và không bị ghi đè. Scraper tiếp tục cào để gom đúng 25 địa điểm MỚI 100%!',
      '',
      '3. LÀM THẾ NÀO ĐỂ CÀO ĐỦ HƠN 100 ĐIỂM (PHƯƠNG PHÁP PHÂN RÃ THEO QUẬN/HUYỆN):',
      'Để vét sạch hơn 100 phòng khám nha khoa tại Hà Nội, kỹ thuật chuẩn của gosom/google-maps-scraper là "Tự động phân mảnh theo Quận/Huyện" (District Subdivision):',
      'Hệ thống tự động chia nhỏ truy vấn thành:',
      '• "Phòng khám nha khoa Quận Cầu Giấy"',
      '• "Phòng khám nha khoa Quận Đống Đa"',
      '• "Phòng khám nha khoa Quận Ba Đình"',
      '• "Phòng khám nha khoa Quận Hai Bà Trưng"',
      '• "Phòng khám nha khoa Quận Thanh Xuân"',
      '• "Phòng khám nha khoa Quận Hà Đông"',
      '• "Phòng khám nha khoa Quận Nam Từ Liêm"...',
      'Mỗi quận crawler sẽ bóc tách 15-25 điểm riêng biệt, tự động hợp nhất và loại bỏ trùng lặp ở ranh giới. Kết quả bạn sẽ thu được đầy đủ 100 - 150+ phòng khám trên toàn thành phố!',
      '',
      '4. LÀM THẾ NÀO ĐỂ BIẾT ĐÃ QUÉT HẾT (3 TÍN HIỆU NHẬN BIẾT 100%):',
      '• Tín hiệu 1 (Tỷ lệ phát hiện mới = 0%): Khi crawler quét qua tất cả các quận/huyện hoặc ô lưới tọa độ, nhưng 100% kết quả Google Maps trả về đều là các địa điểm đã có trong cơ sở dữ liệu -> Hệ thống xác nhận không còn bất kỳ cơ sở nào mới.',
      '• Tín hiệu 2 (Tín hiệu End-of-List từ Google): Khi thanh cuộn của mọi quận đều trả về tín hiệu kết thúc DOM.',
      '• Tín hiệu 3 (Thước đo Độ phủ thị trường): Thanh tiến trình hiển thị: "Đã cào: 115 / ~115 điểm (Độ phủ: 100% - ĐÃ QUÉT CẠN KIỆT TOÀN THÀNH PHỐ)".'
    ],
    steps: [
      'Bước 1: Nhập [Phòng khám nha khoa] vào ô Ngành nghề, nhập [Hà Nội] vào ô Địa điểm.',
      'Bước 2: Bật tùy chọn "⚡ Tự động quét phân mảnh theo 12 Quận của Hà Nội" (hệ thống sẽ tự động mở rộng quét Cầu Giấy, Đống Đa, Ba Đình, Thanh Xuân...).',
      'Bước 3: Bấm nút "🔥 Cào cạn kiệt toàn bộ Hà Nội (>100 điểm)" hoặc cào từng đợt (+25 điểm).',
      'Bước 4: Theo dõi bộ đếm chống trùng: Hệ thống sẽ hiển thị "Đã bỏ qua X địa điểm trùng -> Gom thành công Y địa điểm mới".',
      'Bước 5: Khi thanh trạng thái chuyển sang màu xanh lục báo "🎉 ĐÃ QUÉT HẾT 100% THỊ TRƯỜNG", bạn đã có trong tay danh sách đầy đủ nhất không sót phòng khám nào.'
    ],
    proTips: [
      'Mẹo chuyên gia: Bạn có thể nhập tọa độ GPS tâm của từng cụm (ví dụ 21.035, 105.782 cho khu Cầu Giấy) để quét sâu bán kính 2km quanh đó, giúp tìm ra cả những phòng khám nằm sâu trong ngõ hẻm mà tìm kiếm thông thường không thấy.'
    ]
  },
  multi_user_google_policy: {
    id: 'multi_user_google_policy',
    title: 'Chính sách Google & Cơ chế cào an toàn khi có nhiều người dùng đồng thời',
    subtitle: 'Phân tích tính hợp lệ, nguy cơ bị chặn IP khi nhiều người cào cùng lúc và 5 cơ chế khắc phục kỹ thuật chuẩn',
    tag: 'Chính sách & Kiến trúc Đa người dùng',
    logicExplanation: [
      '1. VẤN ĐỀ VỀ CHÍNH SÁCH GOOGLE (GOOGLE TERMS OF SERVICE):',
      'Theo Điều khoản dịch vụ của Google (Mục 3.3 Google Terms of Service): Google nghiêm cấm hành vi tự động bóc tách (automated scraping), gửi truy vấn tự động bằng robot thu thập dữ liệu trái phép mà không qua Google Maps Platform API chính thức.',
      'Nếu bạn mở phần mềm này cho NHIỀU NGƯỜI DÙNG cùng bấm cào cùng 1 lúc:',
      '• Nguy cơ 1: Nếu tất cả người dùng đều gửi yêu cầu thông qua cùng 1 địa chỉ IP máy chủ của bạn -> Google sẽ phát hiện lưu lượng truy cập bất thường (Unusual Traffic).',
      '• Hậu quả: Google sẽ kích hoạt mã phản hồi HTTP 429 Too Many Requests, bắt giải reCAPTCHA liên tục, hoặc cấm (ban) IP máy chủ của bạn.',
      '',
      '2. CÁC CƠ CHẾ KỸ THUẬT KHẮC PHỤC TRIỆT ĐỂ (DÀNH CHO PHẦN MỀM ĐA NGƯỜI DÙNG):',
      'Để hệ thống chạy mượt mà, phục vụ hàng trăm đến hàng ngàn người dùng đồng thời mà không bị Google chặn, hệ thống áp dụng các giải pháp kiến trúc sau:',
      '• Giải pháp 1 (Pool Proxy Dân Cư Xoay Vòng - Residential Rotating Proxies):',
      'Thay vì dùng IP máy chủ cố định, mỗi truy vấn cào của mỗi người dùng được định tuyến ngẫu nhiên qua hàng triệu địa chỉ IP dân cư (Residential IP) như BrightData, Oxylabs, Smartproxy. Google chỉ thấy các truy vấn đến từ các hộ gia đình cá nhân bình thường rải rác khắp các tỉnh thành, hoàn toàn không phát hiện được hệ thống scraper.',
      '',
      '• Giải pháp 2 (Mô phỏng hành vi con người & Giãn cách ngẫu nhiên - Human Jitter):',
      'Không gửi dồn dập hàng loạt request trong 1 mili-giây. Bộ engine tự động chèn độ trễ ngẫu nhiên (Random Delay 90ms - 280ms), mô phỏng thao tác cuộn chuột và đọc trang tự nhiên của con người.',
      '',
      '• Giải pháp 3 (Hoán đổi dấu vân tay trình duyệt - Browser Fingerprint & User-Agent Spoofer):',
      'Tự động xoay vòng danh sách hàng ngàn User-Agent hiện đại (Chrome 128+, Edge, Safari 18, Firefox), kích thước khung nhìn (Viewport) và các tham số Canvas/WebGL để bot không có dấu hiệu nhận dạng cố định.',
      '',
      '• Giải pháp 4 (Hàng đợi phân tán - Distributed Job Queue):',
      'Khi nhiều người dùng nhấn cào cùng lúc, các tác vụ được đưa vào hàng đợi phân luồng độc lập (Worker Isolation), mỗi worker sử dụng một phiên session và pool proxy riêng biệt để không ảnh hưởng lẫn nhau.',
      '',
      '• Giải pháp 5 (Tùy chọn kết nối Google Cloud Maps API chính thức - 100% Tuân thủ chính sách):',
      'Đối với các khách hàng doanh nghiệp hoặc trường hợp cần tuân thủ 100% chính sách của Google, phần mềm hỗ trợ chế độ nhập Google Places API Key chính thức để lấy thông tin địa điểm được cấp phép, sau đó chỉ dùng crawler ngoài để bóc tách thêm Email/Mạng xã hội từ chính website của doanh nghiệp đó (hoàn toàn hợp pháp vì website công khai của doanh nghiệp không thuộc quyền sở hữu của Google).'
    ],
    steps: [
      'Bước 1: Tại màn hình cấu hình cào, chọn chế độ Proxy là "Pool Proxy Dân Cư (Residential Proxy)" hoặc "Proxy Xoay Vòng".',
      'Bước 2: Thiết lập số luồng đồng thời (Concurrency) phù hợp với số lượng người dùng đang truy cập.',
      'Bước 3: Bật tùy chọn Deep Web Crawl để bóc tách email từ website doanh nghiệp thay vì chỉ phụ thuộc vào Google Maps.',
      'Bước 4: Theo dõi chỉ số tốc độ và nhật ký kết nối để đảm bảo không có lỗi 429.'
    ],
    proTips: [
      'Lưu ý quan trọng: Dữ liệu tên doanh nghiệp, địa chỉ, số điện thoại công khai trên Google Maps không có bản quyền cá nhân, nhưng hành vi cào tần suất cao từ 1 IP duy nhất sẽ bị Google chặn tự động. Sử dụng Rotating Proxy là chìa khóa then chốt cho phần mềm đa người dùng.'
    ]
  },
  data_table: {
    id: 'data_table',
    title: 'Khám phá dữ liệu & Quản lý danh sách khách hàng (Leads Explorer)',
    subtitle: 'Bộ lọc đa chiều, chấm điểm Lead Score và thao tác hàng loạt',
    tag: 'Quản lý Lead',
    logicExplanation: [
      'Hiển thị toàn bộ hơn 33 trường dữ liệu bóc tách từ Google Maps dưới dạng lưới dữ liệu tốc độ cao.',
      'Điểm tiềm năng (Lead Score 0-100): Được tính tự động dựa trên: Có số điện thoại (+15đ), Có website (+15đ), Có email (+15đ), Có mạng xã hội (+5đ), Đánh giá trên 4.5 sao (+5đ), Lượng review dồi dào (+5đ), và Listing Chưa xác minh / Unclaimed (+10đ cơ hội bán dịch vụ).',
      'Trạng thái "Chưa xác minh" (Unclaimed Listing): Đây là các doanh nghiệp chưa sở hữu hồ sơ Google Business Profile chính thức. Đối với các Agency Marketing, SEO và phần mềm, đây là "mỏ vàng" để liên hệ cung cấp dịch vụ xác minh hồ sơ và tối ưu SEO địa phương.'
    ],
    steps: [
      'Bước 1: Sử dụng ô tìm kiếm nhanh để tra cứu theo tên doanh nghiệp, số điện thoại, thành phố hoặc email.',
      'Bước 2: Sử dụng các nút lọc phân khúc nhanh: "Có Email", "Có Số điện thoại", "Chưa xác minh (Unclaimed)", hoặc "Tiềm năng cao (Hot Leads)".',
      'Bước 3: Nhấp vào tiêu đề cột để sắp xếp theo Điểm tiềm năng (Lead Score), Số lượng đánh giá (Reviews), hoặc Điểm sao (Rating).',
      'Bước 4: Tích chọn các ô vuông bên trái để gửi Email tiếp cận hàng loạt hoặc xuất riêng các dòng đã chọn ra file CSV/TSV.'
    ],
    proTips: [
      'Mẹo tiếp cận: Lọc danh sách "Chưa xác minh" + có số điện thoại. Gọi điện hoặc gửi email cảnh báo họ về việc hồ sơ có thể bị đối thủ chiếm quyền sở hữu để chào bán gói dịch vụ Quản trị Google Maps.'
    ],
    fieldExplanations: [
      { name: 'Lead Score', desc: 'Thang điểm từ 0-100 đánh giá mức độ sẵn sàng chuyển đổi của khách hàng doanh nghiệp.' },
      { name: 'Chưa xác minh (Unclaimed)', desc: 'Doanh nghiệp chưa hoàn tất xác thực chủ sở hữu với Google (Cơ hội bán dịch vụ Local SEO).' },
      { name: 'Crawl Email', desc: 'Email liên hệ được bóc tách từ tên miền website của doanh nghiệp.' }
    ]
  },
  map_view: {
    id: 'map_view',
    title: 'Bản đồ trực quan & Phân bố địa lý (Live Map View)',
    subtitle: 'Xem mật độ kinh doanh trên bản đồ tương tác với ghim phân loại màu sắc',
    tag: 'Bản đồ số',
    logicExplanation: [
      'Dựa vào tọa độ Latitude và Longitude chính xác trích xuất từ Google Maps để ghim từng vị trí lên bản đồ.',
      'Màu sắc của ghim phản ánh chất lượng khách hàng tiềm năng: Màu Xanh dương (Hot Lead - Điểm >= 85), Màu Vàng cam (Warm Lead - Điểm 65-84), Màu Xám chì (Listing thông thường).',
      'Tích hợp bảng xem nhanh (Popover Card) hiển thị đầy đủ số điện thoại bấm gọi ngay, email và đường link Google Maps chỉ đường.'
    ],
    steps: [
      'Bước 1: Sử dụng bộ lọc danh mục phía trên bản đồ để chỉ xem các nhóm ngành cụ thể.',
      'Bước 2: Sử dụng các nút Phóng to (+) / Thu nhỏ (-) hoặc Đặt lại khung nhìn để điều hướng bản đồ.',
      'Bước 3: Nhấp vào bất kỳ ghim nào trên bản đồ để mở thẻ thông tin xem nhanh.',
      'Bước 4: Nhấp "Xem hồ sơ chi tiết" để mở ngăn kéo dữ liệu đầy đủ 33 trường.'
    ],
    proTips: [
      'Thích hợp cho đội ngũ thị trường (Field Sales / Sale thị trường): Dễ dàng lên lộ trình ghé thăm trực tiếp các doanh nghiệp tập trung trong cùng một khu phố.'
    ]
  },
  jobs_runner: {
    id: 'jobs_runner',
    title: 'Hàng đợi tác vụ & Dấu hiệu nhận biết Quét xong (Job Runner)',
    subtitle: 'Theo dõi tốc độ quét, nhật ký và cách nhận biết crawler đã quét hết',
    tag: 'Tiến trình nền',
    logicExplanation: [
      'LÀM THẾ NÀO ĐỂ BIẾT ĐÃ QUÉT HẾT?',
      '1. Dấu hiệu 1 (Thẻ thông báo hoàn tất): Thanh trạng thái trên đầu trang chuyển sang khung màu XANH LÁ CÂY với dòng chữ lớn: "✅ ĐÃ QUÉT HOÀN TẤT 100% — ĐÃ QUÉT HẾT TẤT CẢ ĐỊA ĐIỂM!".',
      '2. Dấu hiệu 2 (Âm thanh thông báo): Hệ thống tự động phát một chuông âm thanh êm dịu (chime) qua loa để bạn nhận biết ngay cả khi đang chuyển tab khác.',
      '3. Dấu hiệu 3 (Số lượng đạt mục tiêu): Con số hiển thị đạt tỷ lệ 100% (ví dụ: 25/25 hoặc 50/50 địa điểm yêu cầu). Nếu khu vực có ít địa điểm hơn mục tiêu (ví dụ chỉ có 18 cơ sở trên Maps), crawler sẽ dừng khi cuộn cạn kiệt kết quả (End of Results).',
      '4. Dấu hiệu 4 (Bảng thống kê tức thì): Hiển thị ngay số lượng Email, Số điện thoại và hồ sơ Chưa xác minh vừa thu hoạch được.',
      '5. Dấu hiệu 5 (Tab Quản lý tác vụ): Trạng thái của chiến dịch chuyển sang nhãn màu xanh [ĐÃ HOÀN THÀNH] kèm mốc thời gian hoàn tất.'
    ],
    steps: [
      'Bước 1: Khi nhấn "Bắt đầu cào", quan sát thanh tiến trình phần trăm tăng dần từ 0% lên 100%.',
      'Bước 2: Khi quét hết, thanh màu xanh lá sẽ hiện ra với các nút bấm thao tác nhanh.',
      'Bước 3: Bạn có thể nhấn ngay "Xuất file CSV ngay" hoặc "Soạn email tiếp cận" mà không cần làm gì thêm.',
      'Bước 4: Vào tab "Quản lý tác vụ" để xem lại lịch sử các đợt cào trước đó.'
    ],
    proTips: [
      'Mẹo: Nếu bạn đặt mục tiêu 100 địa điểm nhưng crawler dừng ở 42 địa điểm kèm thông báo hoàn tất, điều đó có nghĩa là toàn bộ thành phố/khu vực đó chỉ có đúng 42 cơ sở kinh doanh ngành nghề đó trên Google Maps (đã cào sạch không sót cơ sở nào)!'
    ]
  },
  outreach_composer: {
    id: 'outreach_composer',
    title: 'Trình soạn thảo Email tiếp cận cá nhân hóa (Cold Outreach)',
    subtitle: 'Tự động điền biến động (Tên doanh nghiệp, Điểm đánh giá, Số review, Địa chỉ) vào email bán hàng',
    tag: 'Tiếp cận khách hàng',
    logicExplanation: [
      'Hệ thống tự động thay thế các biến như {business_name}, {city}, {rating}, {reviews_count}, {website} vào mẫu email chuyên nghiệp.',
      'Tích hợp 4 kịch bản tiếp cận thực chiến:',
      '1. Local SEO & Tối ưu Google Maps (Đánh vào số lượng review và listing chưa xác minh).',
      '2. Hiện đại hóa Website & Tối ưu chuyển đổi di động.',
      '3. Cung cấp khách hàng tiềm năng B2B (Pay-per-lead).',
      '4. Giới thiệu dịch vụ & Hợp tác đối tác địa phương.'
    ],
    steps: [
      'Bước 1: Tích chọn một hoặc nhiều khách hàng từ bảng dữ liệu -> Nhấn "Soạn email tiếp cận".',
      'Bước 2: Chọn kịch bản email phù hợp với dịch vụ của bạn.',
      'Bước 3: Nhấn "Sao chép mẫu" để dán vào phần mềm gửi email, hoặc nhấn "Mở ứng dụng Mail" để mở trực tiếp trình duyệt mail của bạn.',
      'Bước 4: Hoặc nhấn "Xuất file cho Instantly / Apollo" để xuất file CSV đã chuẩn hóa định dạng cột cho các công cụ gửi email tự động.'
    ],
    proTips: [
      'Đề cập trực tiếp số lượng đánh giá thực tế của họ trong dòng tiêu đề giúp tỷ lệ mở email (Open Rate) tăng vọt lên trên 65%.'
    ]
  },
  analytics: {
    id: 'analytics',
    title: 'Thống kê & Báo cáo thị trường (Lead Analytics)',
    subtitle: 'Đo lường độ phủ thông tin liên lạc, chất lượng hồ sơ và phân bố địa lý',
    tag: 'Báo cáo',
    logicExplanation: [
      'Phân tích tự động tỷ lệ có sẵn Email (Email Coverage), tỷ lệ có Số điện thoại, tỷ lệ có Website chính thức.',
      'Tính toán phân bố điểm số đánh giá trung bình và mật độ đánh giá của thị trường mục tiêu.',
      'Xác định số lượng hồ sơ chưa xác thực (Unclaimed Listings) - chỉ số quan trọng cho các công ty làm dịch vụ quản lý thương hiệu.'
    ],
    steps: [
      'Bước 1: Xem tổng quan 4 chỉ số KPI quan trọng ở hàng trên cùng.',
      'Bước 2: Xem biểu đồ phân loại chất lượng khách hàng (Hot / Warm / Cold).',
      'Bước 3: Nhấp nút "Liên hệ nhóm Hot Leads" để mở ngay trình soạn email cho nhóm khách hàng có khả năng chuyển đổi cao nhất.',
      'Bước 4: Theo dõi bảng xếp hạng các ngành nghề và địa phương có nhiều doanh nghiệp nhất.'
    ],
    proTips: [
      'Tỷ lệ có Email trung bình từ 40-75% là dấu hiệu của một thị trường có tính số hóa cao, rất thuận lợi cho chiến dịch Cold Email.'
    ]
  },
  api_cli: {
    id: 'api_cli',
    title: 'Tài liệu tích hợp REST API & Lệnh CLI Terminal',
    subtitle: 'Hướng dẫn chạy scraper bằng dòng lệnh Go binary hoặc tích hợp API',
    tag: 'Dành cho Lập trình viên',
    logicExplanation: [
      'gosom/google-maps-scraper cung cấp file thực thi nhị phân (Binary) viết bằng ngôn ngữ Go cực kỳ nhẹ và nhanh.',
      'Hỗ trợ chế độ Webhook: khi cào xong một địa điểm, tự động gửi HTTP POST payload về máy chủ CRM của bạn.',
      'Cung cấp mẫu mã nguồn sẵn sàng chạy bằng cURL, Node.js (TypeScript) và Python requests.'
    ],
    steps: [
      'Bước 1: Chọn tab ngôn ngữ bạn muốn sử dụng (CLI Terminal, cURL, Node.js, Python).',
      'Bước 2: Nhấn nút "Sao chép mã" ở góc trên bên phải khối lệnh.',
      'Bước 3: Dán vào Terminal của máy chủ hoặc tích hợp vào mã nguồn backend của bạn.',
      'Bước 4: Xem danh sách 33 trường dữ liệu JSON chuẩn ở phần dưới cùng để map vào cơ sở dữ liệu.'
    ],
    proTips: [
      'Nếu cào số lượng lớn trên 10,000 địa điểm, hãy chuẩn bị một danh sách proxy dân cư (Residential Proxy) và đưa vào tham số -proxies proxies.txt.'
    ]
  },
  export_dialog: {
    id: 'export_dialog',
    title: 'Xuất dữ liệu đa định dạng (Export Center)',
    subtitle: 'Tải về CSV tiêu chuẩn, JSON thô, file định dạng CRM hoặc sao chép nhanh vào bảng tính',
    tag: 'Xuất dữ liệu',
    logicExplanation: [
      'Hỗ trợ 4 hình thức xuất dữ liệu chuyên nghiệp:',
      '1. CSV Tiêu chuẩn: Đầy đủ hơn 33 cột dữ liệu, mã hóa UTF-8 với ký tự xuống dòng chuẩn, mở được trực tiếp trên Excel, Google Sheets, LibreOffice.',
      '2. CRM Export: Định dạng sẵn tên cột theo chuẩn quốc tế (Company, Email, Phone, Website, City, Rating) tương thích 100% với Lemlist, Instantly, Smartlead, Apollo, HubSpot.',
      '3. JSON mảng thô: Cấu trúc đối tượng chi tiết theo đúng schema của gosom, thích hợp cho việc import vào cơ sở dữ liệu MongoDB/PostgreSQL.',
      '4. Sao chép TSV vào Clipboard: Sao chép dạng Tab-Separated Values, bạn chỉ cần mở Google Sheet trống và nhấn Ctrl+V (hoặc Cmd+V) là dữ liệu tự động dàn thành từng cột ngăn nắp.'
    ],
    steps: [
      'Bước 1: Nhấn nút "Xuất dữ liệu" trên thanh menu trên cùng hoặc chọn xuất các dòng đã lọc.',
      'Bước 2: Chọn định dạng phù hợp với nhu cầu của bạn.',
      'Bước 3: Tải file về máy tính hoặc dán ngay vào bảng tính của bạn.'
    ],
    proTips: [
      'Dùng tính năng "Sao chép TSV" để dán nhanh vào Google Sheets mà không cần qua bước tải file và nhập file.'
    ]
  }
};
