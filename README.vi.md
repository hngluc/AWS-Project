# Smart Image Platform

[English](./README.md)

Smart Image Platform là một ứng dụng lưu trữ, xử lý và phân tích ảnh bằng AI theo kiến trúc serverless trên AWS. Dự án gồm frontend React, backend AWS Lambda và hạ tầng AWS CDK.

Nền tảng cho phép người dùng upload ảnh trực tiếp lên S3, tự động tạo thumbnail/ảnh resized, phân tích nội dung bằng Amazon Rekognition, tìm kiếm theo tag AI, kiểm duyệt ảnh bị gắn cờ, công khai ảnh ra community gallery, xóa nhiều ảnh cùng lúc và tải ảnh gốc qua signed URL ngắn hạn.

## Chức Năng Chính

- Upload an toàn bằng S3 presigned PUT URL.
- Tự động tạo thumbnail và ảnh resized bằng Sharp.
- Trích xuất EXIF trong quá trình xử lý ảnh.
- Nhận diện object/scene bằng Amazon Rekognition.
- Kiểm duyệt nội dung và hàng đợi review cho admin.
- Gallery cá nhân, community gallery và tìm kiếm theo tag.
- Chuyển trạng thái ảnh giữa riêng tư/công khai.
- Xóa nhiều ảnh đã chọn cùng lúc.
- Tải ảnh gốc bằng presigned S3 GetObject URL.
- Xác thực Cognito với vai trò user/admin.
- Phân phối ảnh đã xử lý qua CloudFront.
- Quản lý hạ tầng bằng AWS CDK v2.
- Frontend có demo mode khi chưa cấu hình Cognito/API.

## Kiến Trúc

```mermaid
flowchart TD
  User["User"] --> FE["React Frontend"]
  FE --> Cognito["Amazon Cognito"]
  FE --> API["API Gateway"]
  API --> ApiLambda["API Handler Lambda"]
  ApiLambda --> RawS3["Raw S3 Bucket"]
  ApiLambda --> DDB["DynamoDB"]
  FE --> RawS3
  RawS3 --> Processor["Image Processor Lambda"]
  Processor --> ProcessedS3["Processed S3 Bucket"]
  Processor --> DDB
  Processor -.-> DLQ_IP["SQS DLQ (Image Processor)"]
  
  DDB --> DDBStream["DynamoDB Stream"]
  DDBStream --> Analyzer["AI Analyzer Lambda"]
  DDBStream -.-> DLQ_AI["SQS DLQ (AI Analyzer)"]
  Analyzer --> Rekognition["Amazon Rekognition"]
  Analyzer --> DDB
  
  FE --> CloudFront["CloudFront CDN"]
  CloudFront --> ProcessedS3

  CW["CloudWatch Alarms"] --> SNS["SNS Topic"]
  SNS --> Email["Operator Email"]
```

## Cấu Trúc Dự Án

```text
smart-image-platform/
├── backend/
│   ├── api-handler/       # REST API Lambda: CRUD ảnh, search, moderation, signed URL
│   ├── image-processor/   # Lambda trigger bởi S3: resize, thumbnail, EXIF
│   ├── ai-analyzer/       # Lambda trigger bởi DynamoDB Stream: Rekognition
│   ├── authorizer/        # Hỗ trợ JWT authorizer
│   └── shared/            # AWS clients và utility dùng chung
├── frontend/              # React + Vite single page app
├── infrastructure/        # AWS CDK stacks
│   ├── bin/app.ts         # Điểm vào CDK app
│   ├── lib/stacks/        # Auth, storage, database, API, monitoring stacks
│   └── test/              # Bộ unit/integration/snapshot test cho CDK Stack
├── package.json           # npm workspaces root
└── tsconfig.base.json     # TypeScript config dùng chung
```

## AWS Services

- **Amazon S3** để lưu ảnh gốc và ảnh đã xử lý.
- **Amazon CloudFront** để phân phối ảnh qua CDN.
- **Amazon API Gateway** cho REST API.
- **AWS Lambda** cho API, xử lý ảnh, phân tích AI và authorizer (chạy trên môi trường ARM64 chip Graviton2 tiết kiệm chi phí).
- **Amazon DynamoDB** cho metadata ảnh, quota, tag search và moderation state (kèm cấu hình Point-In-Time Recovery PITR tự động sao lưu).
- **Amazon Rekognition** cho label và moderation label.
- **Amazon Cognito** cho xác thực.
- **Amazon SQS** làm Hàng đợi thư rác (Dead Letter Queue) đón lỗi từ các luồng bất đồng bộ.
- **Amazon SNS** làm kênh chuyển tiếp cảnh báo lỗi từ CloudWatch Alarm đến Email quản trị viên.
- **Amazon CloudWatch** và **X-Ray** cho log, metric, tracing, dashboard và alarm.

## Yêu Cầu

- Node.js 20 trở lên.
- npm 10 trở lên.
- AWS CLI đã cấu hình credentials cho account cần deploy.
- AWS CDK v2 CLI.
- CDK environment đã bootstrap trong AWS account/region mục tiêu.

Region mặc định của dự án là `ap-southeast-1`.

## Cài Đặt

```bash
cd smart-image-platform
npm install
```

## Chạy Frontend Local

Chạy React app:

```bash
npm run --workspace=frontend dev
```

Nếu chưa cấu hình các biến dưới đây, frontend sẽ tự chạy demo mode:

```env
VITE_API_URL=https://your-api-id.execute-api.ap-southeast-1.amazonaws.com/dev
VITE_USER_POOL_ID=ap-southeast-1_xxxxxxxx
VITE_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=ap-southeast-1
```

Demo mode có sẵn tài khoản:

```text
user@example.com / Password123!
admin@example.com / Password123!
```

Lưu ý: demo mode lưu dữ liệu ảnh giả lập trong browser storage. Ảnh quá lớn có thể vượt quota của trình duyệt. Khi chạy AWS thật, ảnh được upload lên S3 nên không gặp giới hạn localStorage này.

## Build Và Test

Build toàn bộ workspaces:

```bash
npm run build
```

Chạy test (sử dụng Jest + ts-jest để kiểm thử các stack CDK hạ tầng lẫn mã nguồn Lambda backend):

```bash
npm test
```

Chạy lint frontend:

```bash
npm run --workspace=frontend lint
```

Build từng workspace:

```bash
npm run --workspace=@smart-image/api-handler build
npm run --workspace=@smart-image/image-processor build
npm run --workspace=@smart-image/ai-analyzer build
npm run --workspace=infrastructure build
npm run --workspace=frontend build
```

## Deploy

### Bước 1: Cấu hình biến môi trường
1. Sao chép tệp `.env.example` ở thư mục gốc thành `.env`:
   ```bash
   cp .env.example .env
   ```
2. Mở tệp `.env` và điền đầy đủ các thông tin:
   * **AWS Credentials**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` để CDK có quyền deploy lên tài khoản AWS của bạn.
   * **GitHub Config**: `GITHUB_REPO_URL` (URL repo GitHub của bạn), `GITHUB_BRANCH` (nhánh cần Amplify deploy, ví dụ: `phuong` hoặc `staging`), và `GITHUB_TOKEN` (GitHub Personal Access Token có quyền `repo` và `admin:repo_hook` để Amplify tạo Webhook tự động).

3. Nạp biến môi trường vào phiên làm việc hiện tại (đối với PowerShell trên Windows):
   ```powershell
   .\load-env.ps1
   ```

### Bước 2: Bootstrap CDK (chỉ cần làm một lần cho mỗi account/region)
```bash
npx cdk bootstrap aws://ACCOUNT_ID/ap-southeast-1
```

### Bước 3: Build dự án
Build toàn bộ workspaces (bao gồm cả backend shared, lambdas và frontend):
```bash
npm run build
```

### Bước 4: Deploy CDK lên AWS
* **Deploy môi trường staging:**
  ```powershell
  npm run --workspace=infrastructure deploy:staging
  ```
* **Deploy môi trường production:**
  ```powershell
  npm run --workspace=infrastructure deploy:production
  ```

Sau khi chạy lệnh deploy thành công, CDK sẽ khởi tạo toàn bộ hạ tầng backend và liên kết AWS Amplify với repository GitHub của bạn.

### Bước 5: Đường ống CI/CD Tự động
Hãy đảm bảo bạn đã đẩy toàn bộ mã nguồn của mình lên repository GitHub tương ứng. Khi bạn đẩy code (push event) lên nhánh `main`, hệ thống GitHub Actions sẽ tự động kích hoạt đường ống CI/CD:
1. **Job Build và Test**: Thực hiện cài đặt, build và chạy toàn bộ unit/integration test thông qua Jest.
2. **Job Deploy Staging**: Tự động deploy cấu hình hạ tầng staging lên AWS nếu bước kiểm thử thành công.
3. **Job Deploy Production**: Chạy lệnh đối chiếu cấu hình `cdk diff` để ghi log các thay đổi hạ tầng, sau đó triển khai hạ tầng Production (có chế độ yêu cầu phê duyệt bảo vệ môi trường nếu được thiết lập trên GitHub).
4. **AWS Amplify Trigger**: Amplify phát hiện thay đổi và tự động cập nhật Frontend mà không cần deploy thủ công từ máy local.

## API Endpoints

Tất cả endpoint ảnh và admin cần Cognito JWT trong header `Authorization: Bearer <token>`.

| Method | Path | Mô tả |
| --- | --- | --- |
| `POST` | `/v1/images/presigned-url` | Tạo metadata ảnh và trả về presigned S3 upload URL. |
| `GET` | `/v1/images` | Lấy danh sách ảnh của user đang đăng nhập. |
| `GET` | `/v1/images/public` | Lấy ảnh công khai, an toàn, đã xử lý xong cho community gallery. |
| `GET` | `/v1/images/search?tag=TagName` | Tìm ảnh user được phép xem theo tag AI. |
| `GET` | `/v1/images/{imageId}` | Lấy chi tiết ảnh, AI tags, EXIF và trạng thái. |
| `PATCH` | `/v1/images/{imageId}` | Cập nhật metadata ảnh, ví dụ visibility. |
| `DELETE` | `/v1/images/{imageId}` | Xóa một ảnh và các object S3 liên quan. |
| `DELETE` | `/v1/images/bulk` | Xóa nhiều ảnh thuộc user hiện tại. |
| `GET` | `/v1/images/{imageId}/download` | Trả về signed URL ngắn hạn để tải ảnh gốc. |
| `GET` | `/v1/admin/moderation` | Lấy danh sách ảnh trong hàng đợi kiểm duyệt. Chỉ admin. |
| `POST` | `/v1/admin/moderation/{imageId}` | Approve/reject ảnh bị gắn cờ. Chỉ admin. |

## Luồng Xử Lý Ảnh

1. Frontend gọi `/v1/images/presigned-url`.
2. API Handler tạo record DynamoDB với trạng thái `UPLOADING` và trả về signed S3 URL.
3. Frontend upload file gốc trực tiếp lên raw S3 bucket.
4. S3 object-created event kích hoạt Image Processor Lambda.
5. Processor tạo thumbnail/resized asset, trích xuất metadata, ghi ảnh đã xử lý lên S3 và cập nhật DynamoDB.
6. DynamoDB Streams kích hoạt AI Analyzer Lambda.
7. Analyzer gọi Rekognition, lưu AI tags/moderation labels và cập nhật trạng thái cuối.
8. Frontend đọc metadata qua API Gateway và hiển thị ảnh bằng CloudFront URL.

## Ghi Chú Data Model

Bảng DynamoDB chính dùng single-table design:

```text
PK = USER#<userId>
SK = IMG#<timestamp>#<imageId>
```

Indexes:

- `GSI1-TagIndex` phục vụ tìm kiếm theo tag.
- `GSI2-ModerationIndex` phục vụ hàng đợi moderation.

Endpoint public gallery hiện dùng DynamoDB scan và filter theo `visibility`, `moderationStatus`, `status`. Cách này ổn cho dữ liệu nhỏ. Nếu dùng production với nhiều ảnh công khai, nên thêm GSI riêng cho ảnh public/safe/completed.

## Ghi Chú Bảo Mật

- S3 buckets chặn public access và bật encryption.
- Ảnh đã xử lý được phân phối qua CloudFront.
- Upload/download dùng signed URL ngắn hạn.
- API routes yêu cầu Cognito authentication.
- Admin moderation routes kiểm tra role admin ở backend.
- Search results được filter để không lộ ảnh private của user khác.
- Lambda permissions được giới hạn theo resource mà từng function cần.

## License

MIT
