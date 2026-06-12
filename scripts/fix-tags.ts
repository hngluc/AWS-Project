import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const region = 'ap-southeast-1';
const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

const IMAGE_TABLE = 'SmartImage-Images-staging'; // Assuming environment=staging, let me check package.json

async function run() {
  console.log('Scanning images...');
  const imagesRes = await docClient.send(new ScanCommand({
    TableName: IMAGE_TABLE,
    FilterExpression: 'begins_with(PK, :prefix)',
    ExpressionAttributeValues: { ':prefix': { S: 'USER#' } }
  }));
  
  const images = imagesRes.Items || [];
  const imageMap = new Map();
  for (const img of images) {
    if (img.imageId?.S) {
      imageMap.set(img.imageId.S, { PK: img.PK.S, SK: img.SK.S });
    }
  }
  console.log(`Found ${images.length} images.`);

  console.log('Scanning tags...');
  const tagsRes = await docClient.send(new ScanCommand({
    TableName: IMAGE_TABLE,
    FilterExpression: 'begins_with(PK, :prefix)',
    ExpressionAttributeValues: { ':prefix': { S: 'TAG#' } }
  }));

  const tags = tagsRes.Items || [];
  console.log(`Found ${tags.length} tags.`);

  for (const tag of tags) {
    const imageId = tag.imageId?.S;
    if (imageId && imageMap.has(imageId)) {
      const imgKeys = imageMap.get(imageId);
      console.log(`Updating Tag ${tag.PK.S} - ${tag.SK.S} with imagePK=${imgKeys.PK}, imageSK=${imgKeys.SK}`);
      await docClient.send(new UpdateCommand({
        TableName: IMAGE_TABLE,
        Key: { PK: tag.PK.S, SK: tag.SK.S },
        UpdateExpression: 'SET imagePK = :pk, imageSK = :sk',
        ExpressionAttributeValues: {
          ':pk': imgKeys.PK,
          ':sk': imgKeys.SK
        }
      }));
    }
  }
  console.log('Done!');
}

run().catch(console.error);
