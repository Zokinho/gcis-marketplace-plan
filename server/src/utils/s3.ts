import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from './logger';

/** Whether S3 storage is configured — reads env at call time to avoid import-order issues */
export function isS3Configured(): boolean {
  return !!(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
}

let s3Client: S3Client | null = null;

function getClient(): S3Client | null {
  if (!isS3Configured()) return null;
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION || 'tor1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      forcePathStyle: false, // DigitalOcean Spaces uses virtual-hosted style
    });
    logger.info({ endpoint: process.env.S3_ENDPOINT, bucket: process.env.S3_BUCKET || 'harvex-uploads', region: process.env.S3_REGION || 'tor1' }, '[S3] Client initialized');
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
    Bucket: (process.env.S3_BUCKET || 'harvex-uploads'),
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
    Bucket: (process.env.S3_BUCKET || 'harvex-uploads'),
    Key: key,
  });

  const url = await getSignedUrl(client, command, { expiresIn: parseInt(process.env.S3_PRESIGN_EXPIRES || '3600', 10) });
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
    Bucket: (process.env.S3_BUCKET || 'harvex-uploads'),
    Key: key,
  }));

  logger.info({ key }, '[S3] File deleted');
  return true;
}
