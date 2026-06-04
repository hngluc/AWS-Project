# 🖼️ Smart Image Platform

A **production-ready**, fully serverless image storage and processing platform built on AWS.

## Architecture

- **Serverless & Event-Driven** — Zero server management, automatic scaling
- **AWS Services**: S3, Lambda, API Gateway, DynamoDB, CloudFront, Rekognition, Cognito, IAM
- **Infrastructure as Code** — AWS CDK v2 (TypeScript)

## Features

- 📤 **Secure Upload** — S3 Presigned URLs for direct client-to-S3 upload (up to 25MB)
- 🖼️ **Auto Processing** — Thumbnail (200x200) and resized (1920x1080) generation in WebP
- 🤖 **AI Analysis** — Automatic object detection, scene labeling, and content moderation via Rekognition
- 🔍 **Tag Search** — Search images by AI-generated tags via DynamoDB GSI
- 🛡️ **Content Moderation** — Auto-flag inappropriate content with admin review queue
- 🔐 **Auth** — Cognito User Pool with JWT, MFA support, admin/user roles
- 🌐 **CDN Delivery** — CloudFront with OAC for low-latency, cached image delivery
- 📊 **Monitoring** — CloudWatch dashboards, alarms, X-Ray tracing
- 🔒 **Security** — IAM least privilege, S3 Block Public Access, SSE encryption, OWASP mitigations

## Project Structure

```
smart-image-platform/
├── infrastructure/          # AWS CDK stacks (IaC)
│   ├── lib/stacks/
│   │   ├── storage-stack    # S3 + CloudFront + OAC
│   │   ├── database-stack   # DynamoDB tables + GSIs
│   │   ├── auth-stack       # Cognito User Pool
│   │   ├── api-stack        # API Gateway + Lambda functions
│   │   └── monitoring-stack # CloudWatch alarms + dashboard
│   └── bin/app.ts           # CDK entry point
├── backend/
│   ├── shared/              # Shared utilities, types, clients
│   ├── api-handler/         # REST API Lambda (CRUD, presigned URLs)
│   ├── image-processor/     # S3-triggered Lambda (resize, EXIF)
│   ├── ai-analyzer/         # Rekognition Lambda (labels, moderation)
│   └── authorizer/          # JWT validation Lambda
└── frontend/                # (Phase 2 — React SPA)
```

## Prerequisites

- **Node.js** >= 20.x
- **AWS CLI** configured with appropriate credentials
- **AWS CDK CLI**: `npm install -g aws-cdk`
- **AWS Account** bootstrapped for CDK: `cdk bootstrap aws://ACCOUNT-ID/ap-southeast-1`

## Quick Start

### 1. Install Dependencies

```bash
cd smart-image-platform
npm install
```

### 2. Bootstrap CDK (first time only)

```bash
cdk bootstrap aws://YOUR_ACCOUNT_ID/ap-southeast-1
```

### 3. Deploy to AWS

```bash
# Deploy all stacks to staging
cd infrastructure
npx cdk deploy --all -c environment=staging

# Deploy to production
npx cdk deploy --all -c environment=production
```

### 4. Verify Deployment

After deployment, CDK will output:
- API Gateway URL
- CloudFront domain
- Cognito User Pool ID
- S3 bucket names

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /v1/images/presigned-url | JWT | Get upload URL |
| GET | /v1/images | JWT | List images (paginated) |
| GET | /v1/images/{id} | JWT | Image details + AI tags |
| DELETE | /v1/images/{id} | JWT | Delete image |
| PATCH | /v1/images/{id} | JWT | Update visibility |
| GET | /v1/images/search?tag=X | JWT | Search by AI tag |
| GET | /v1/admin/moderation | Admin | Flagged images queue |
| POST | /v1/admin/moderation/{id} | Admin | Approve/reject |

## Security

- All S3 buckets: Block Public Access, SSE encryption, SSL enforced
- API Gateway: Cognito JWT auth, rate limiting, request validation
- Lambda: IAM least privilege per function
- CloudFront: OAC (SigV4 signed requests to S3), HTTPS only
- Input validation: Magic bytes file type check, filename sanitization

## Cost Estimate (Staging)

| Service | Est. Monthly Cost |
|---------|-------------------|
| Lambda (light usage) | ~$0.50 |
| API Gateway | ~$1.00 |
| DynamoDB (on-demand) | ~$0.50 |
| S3 (10GB stored) | ~$0.25 |
| CloudFront | ~$1.00 |
| Rekognition | ~$1.00/1000 images |
| Cognito (< 50K MAU) | Free |
| **Total** | **~$4-5/month** |

## License

MIT
