import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ulid } from 'ulid';
import { UserContext, requireAuth } from '../middleware/auth';

let _docClient: any;
let _s3Client: any;
let _cognitoClient: any;

async function getDocClient() {
  if (!_docClient) {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    _docClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
  }
  return _docClient;
}

async function getS3Client() {
  if (!_s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    _s3Client = new S3Client({ region: process.env.AWS_REGION });
  }
  return _s3Client;
}

async function getCognitoClient() {
  if (!_cognitoClient) {
    const { CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
    _cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
  }
  return _cognitoClient;
}

const PROFILE_TABLE = process.env.USER_PROFILE_TABLE_NAME!;
const RAW_BUCKET = process.env.RAW_BUCKET_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const PRESIGNED_EXPIRY = parseInt(process.env.PRESIGNED_URL_EXPIRY || '900', 10);

const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-() ]*\.[a-zA-Z]{2,5}$/;
const PHONE_REGEX = /^[+]?[0-9 ()-]{8,20}$/;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function syncProfileToCognito(userId: string, displayName?: string, phoneNumber?: string) {
  if (!displayName && !phoneNumber) {
    return;
  }

  const { AdminUpdateUserAttributesCommand } = await import('@aws-sdk/client-cognito-identity-provider');
  const cognitoClient = await getCognitoClient();
  const userAttributes: Array<{ Name: string; Value: string }> = [];

  if (displayName) {
    userAttributes.push({ Name: 'name', Value: displayName });
  }
  if (phoneNumber) {
    userAttributes.push({ Name: 'phone_number', Value: phoneNumber });
  }

  try {
    await cognitoClient.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: userId,
      UserAttributes: userAttributes,
    }));
  } catch (error) {
    console.warn('Failed to sync profile to Cognito', { userId, error });
  }
}

export async function handleGetProfile(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId, email } = userContext;
  const claims = event.requestContext.authorizer?.claims || {};

  const docClient = await getDocClient();
  const profileResult = await docClient.send(new GetCommand({
    TableName: PROFILE_TABLE,
    Key: {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
    },
  }));

  const profile = profileResult.Item || {};
  const displayName = profile.displayName || claims.name || claims.fullname || email.split('@')[0] || '';

  let avatarUrl = profile.avatarUrl || null;

  // Generate Presigned GET URL for Avatar if avatarKey exists
  if (profile.avatarKey) {
    try {
      const s3Client = await getS3Client();
      avatarUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: RAW_BUCKET,
          Key: profile.avatarKey,
        }),
        { expiresIn: PRESIGNED_EXPIRY },
      );
    } catch (error) {
      console.error('Failed to generate presigned GET URL for avatar', { error });
    }
  }

  return jsonResponse(200, {
    success: true,
    data: {
      userId,
      email,
      displayName,
      phoneNumber: profile.phoneNumber || null,
      avatarKey: profile.avatarKey || null,
      avatarUrl: avatarUrl,
      createdAt: profile.createdAt || null,
      updatedAt: profile.updatedAt || null,
    },
  });
}

export async function handleGetAvatarUploadUrl(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;

  let body: { filename?: string; contentType?: string; fileSize?: number };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid JSON body' });
  }

  const { filename, contentType, fileSize } = body;

  if (!filename || typeof filename !== 'string' || !SAFE_FILENAME_REGEX.test(filename)) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid filename' });
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Path traversal not allowed' });
  }
  if (!contentType || !ALLOWED_AVATAR_MIME_TYPES.includes(contentType)) {
    return jsonResponse(400, {
      success: false,
      error: 'BadRequest',
      message: `contentType must be one of: ${ALLOWED_AVATAR_MIME_TYPES.join(', ')}`,
    });
  }
  if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0 || fileSize > MAX_AVATAR_FILE_SIZE) {
    return jsonResponse(400, {
      success: false,
      error: 'BadRequest',
      message: `fileSize must be between 1 byte and ${MAX_AVATAR_FILE_SIZE / (1024 * 1024)} MB`,
    });
  }

  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const avatarId = ulid();
  const avatarKey = `users/${userId}/avatar/${avatarId}.${extension}`;

  const s3Client = await getS3Client();
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: RAW_BUCKET,
      Key: avatarKey,
      ContentType: contentType,
    }),
    { expiresIn: PRESIGNED_EXPIRY },
  );

  return jsonResponse(200, {
    success: true,
    data: {
      uploadUrl,
      avatarKey,
      expiresIn: PRESIGNED_EXPIRY,
    },
  });
}

export async function handleUpdateProfile(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId, email } = userContext;

  let body: { displayName?: unknown; phoneNumber?: unknown; avatarKey?: unknown; avatarUrl?: unknown };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid JSON body' });
  }

  const hasDisplayName = body.displayName !== undefined;
  const hasPhone = body.phoneNumber !== undefined;
  const hasAvatarKey = body.avatarKey !== undefined;
  const hasAvatarUrl = body.avatarUrl !== undefined;

  if (!hasDisplayName && !hasPhone && !hasAvatarKey && !hasAvatarUrl) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'No fields provided for update' });
  }

  const updates: Record<string, any> = {};
  const now = new Date().toISOString();

  if (hasDisplayName) {
    if (typeof body.displayName !== 'string') {
      return jsonResponse(400, { success: false, error: 'BadRequest', message: 'displayName must be a string' });
    }
    const displayName = body.displayName.trim();
    if (displayName.length < 2 || displayName.length > 80) {
      return jsonResponse(400, { success: false, error: 'BadRequest', message: 'displayName must be 2-80 characters' });
    }
    updates.displayName = displayName;
  }

  if (hasPhone) {
    if (body.phoneNumber !== null && typeof body.phoneNumber !== 'string') {
      return jsonResponse(400, { success: false, error: 'BadRequest', message: 'phoneNumber must be a string or null' });
    }
    let phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : null;
    
    // Auto format Vietnamese phone numbers to E.164 (+84)
    if (phoneNumber && phoneNumber.startsWith('0') && phoneNumber.length === 10) {
      phoneNumber = '+84' + phoneNumber.slice(1);
    }

    if (phoneNumber && !PHONE_REGEX.test(phoneNumber)) {
      return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid phoneNumber format' });
    }
    updates.phoneNumber = phoneNumber;
  }

  if (hasAvatarKey) {
    if (body.avatarKey !== null && typeof body.avatarKey !== 'string') {
      return jsonResponse(400, { success: false, error: 'BadRequest', message: 'avatarKey must be a string or null' });
    }
    if (typeof body.avatarKey === 'string' && !body.avatarKey.startsWith(`users/${userId}/avatar/`)) {
      return jsonResponse(403, { success: false, error: 'Forbidden', message: 'avatarKey does not belong to user' });
    }
    updates.avatarKey = body.avatarKey;
  }

  if (hasAvatarUrl) {
    if (body.avatarUrl !== null && typeof body.avatarUrl !== 'string') {
      return jsonResponse(400, { success: false, error: 'BadRequest', message: 'avatarUrl must be a string or null' });
    }
    updates.avatarUrl = body.avatarUrl;
  }

  const docClient = await getDocClient();

  const updateExpressions: string[] = [];
  const expressionValues: Record<string, any> = {
    ':updatedAt': now,
    ':createdAt': now,
    ':email': email,
  };

  for (const [field, value] of Object.entries(updates)) {
    updateExpressions.push(`${field} = :${field}`);
    expressionValues[`:${field}`] = value;
  }

  await docClient.send(new UpdateCommand({
    TableName: PROFILE_TABLE,
    Key: {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}, updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :createdAt), email = if_not_exists(email, :email)`,
    ExpressionAttributeValues: expressionValues,
  }));

  await syncProfileToCognito(userId, updates.displayName, updates.phoneNumber);

  return jsonResponse(200, {
    success: true,
    data: {
      userId,
      ...updates,
      updatedAt: now,
    },
  });
}
