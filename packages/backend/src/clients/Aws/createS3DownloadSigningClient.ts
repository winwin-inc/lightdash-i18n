import { S3, type S3ClientConfig } from '@aws-sdk/client-s3';
import { type S3Config } from '../../config/parseConfig';

type DownloadSigningConfig = Pick<
    S3Config,
    'publicEndpoint' | 'region' | 'accessKey' | 'secretKey'
>;

/**
 * When `bucketEndpoint: true`, AWS SDK v3 treats `Bucket` as the endpoint URL
 * (not the real bucket name). Pass the public/custom domain so signed URLs are
 * `https://custom-domain/key` instead of failing with "Invalid URL".
 *
 * @see https://github.com/aws/aws-sdk-js-v3/issues/3811
 */
export function resolveDownloadSigningBucket(
    bucket: string,
    publicEndpoint: string | undefined,
    isUsingDownloadSigningClient: boolean,
): string {
    if (!isUsingDownloadSigningClient) {
        return bucket;
    }

    const endpoint = publicEndpoint?.trim();
    return endpoint || bucket;
}

/**
 * Returns an S3 client suitable for GetObject download pre-signed URLs.
 *
 * When `publicEndpoint` is set (custom domain bound to the bucket), the client
 * uses `bucketEndpoint: true` so the signed URL host is the custom domain
 * itself — not `bucket.custom-domain` or path-style with the bucket in the path.
 *
 * Call sites must pass `resolveDownloadSigningBucket(...)` as `Bucket` when
 * signing with this client.
 *
 * When unset, returns the provided API client unchanged.
 */
export function createS3DownloadSigningClient(
    apiClient: S3,
    config: DownloadSigningConfig | undefined,
): S3 {
    const publicEndpoint = config?.publicEndpoint?.trim();
    if (!publicEndpoint || !config?.region) {
        return apiClient;
    }

    const s3Config: S3ClientConfig = {
        region: config.region,
        apiVersion: '2006-03-01',
        endpoint: publicEndpoint,
        // Custom domain is already bound to one bucket; do not prefix bucket in host/path.
        // With this flag, GetObjectCommand.Bucket must be the endpoint URL.
        bucketEndpoint: true,
    };

    if (config.accessKey && config.secretKey) {
        s3Config.credentials = {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey,
        };
    }

    return new S3(s3Config);
}
