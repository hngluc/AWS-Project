import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Client Singleton
 * 
 * Reuses the same client instance across Lambda invocations (warm starts)
 * to avoid connection overhead. The client is created once when the Lambda
 * container initializes and persists across invocations.
 * 
 * marshallOptions:
 * - removeUndefinedValues: Automatically strip undefined values from items
 * - convertEmptyValues: Convert empty strings/sets to DynamoDB null type
 */

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  // maxAttempts: 3 is default, good for transient failures
});

const marshallOptions = {
  // Remove undefined values from the item before sending to DynamoDB
  removeUndefinedValues: true,
  // Convert empty strings/binary/sets to null
  convertEmptyValues: false,
  // Don't convert class instances (security: prevent prototype pollution)
  convertClassInstanceToMap: false,
};

const unmarshallOptions = {
  // Return numbers as native JS numbers (not strings)
  wrapNumbers: false,
};

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions,
  unmarshallOptions,
});

export { dynamoClient, docClient };
