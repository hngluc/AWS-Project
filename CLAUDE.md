# AI Assistant Rules & Guidelines

Dưới đây là các quy tắc được tổng hợp từ lịch sử làm việc để tránh lặp lại các thiếu sót trước đó. Hãy luôn kiểm tra các quy tắc này trước khi hoàn thành một tác vụ.

## 1. Quy tắc về Đa ngôn ngữ (i18n) & Dịch thuật
Khi được yêu cầu triển khai tính năng đa ngôn ngữ hoặc dịch một trang/component, hãy chắc chắn rằng bạn đã rà soát và dịch **TẤT CẢ** các thành phần giao diện, đặc biệt là:
- **Toast Notifications / Alerts**: Các thông báo lỗi, thông báo thành công dạng popup (thường nằm trong các hàm `try...catch` hoặc callback).
- **Navigation (Sidebar, Header, Tabs)**: Các tiêu đề trang, menu điều hướng, và các text mô tả đi kèm.
- Không chỉ tập trung vào các đoạn text tĩnh trong mã HTML/JSX.

## 2. Quy tắc về Triển khai Tính năng mới
- Hãy kiểm tra tính bao quát (edge cases) của tính năng. Nếu thêm một state mới (như ngôn ngữ, theme), phải đảm bảo state đó được apply xuyên suốt toàn bộ App chứ không chỉ riêng ở file đang mở.
