/**
 * User Quota Type Definitions
 */

export interface UserQuota {
  PK: string;               // USER#<userId>
  SK: string;               // QUOTA#MONTHLY | QUOTA#STORAGE
  currentCount: number;
  maxCount: number;
  currentStorageBytes: number;
  maxStorageBytes: number;
  periodStart: string;       // ISO 8601 — start of the billing period
  updatedAt: string;
}

export const DEFAULT_QUOTA = {
  maxCount: 1000,                         // 1000 images per month
  maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB total storage
} as const;
