import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from './logger';

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION || 'nyc3';
const S3_BUCKET = process.env.S3_BUCKET || 'harvex-uploads';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_PRESIGN_EXPIRES = parseInt(process.env.S3_PRESIGN_EXPIRES || '3600', 10);

/** Whether S3 storage is configured and available */
export const isS3Configured = !!(S3_ENDPOINT && S3_ACCESS_KEY && S3_SECRET_KEY);

let s3Client: S3Client | null = null;

function getClient(): S3Client | null {
  if (!isS3Configured) return null;
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT!,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY!,
        secretAccessKey: S3_SECRET_KEY!,
      },
      forcePathStyle: false, // DigitalOcean Spaces uses virtual-hosted style
    });
    logger.info({ endpoint: S3_ENDPOINT, bucket: S3_BUCKET, region: S3_REGION }, '[S3] Client initialized');
  }
  return s3Client;
}

/**
 * Upload a file buffer to S3-compatible storage.
 * Returns the object key on success, or null if S3 is not configured.
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'private',
  }));

  logger.info({ key, size: buffer.length, contentType }, '[S3] File uploaded');
  return key;
}

/**
 * Generate a time-limited presigned URL for reading a file from S3.
 * Returns null if S3 is not configured.
 */
export async function getSignedFileUrl(key: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  const url = await getSignedUrl(client, command, { expiresIn: S3_PRESIGN_EXPIRES });
  return url;
}

/**
 * Delete a file from S3-compatible storage.
 * Returns true on success, false if S3 is not configured.
 */
export async function deleteFile(key: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  await client.send(new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  }));

  logger.info({ key }, '[S3] File deleted');
  return true;
}
