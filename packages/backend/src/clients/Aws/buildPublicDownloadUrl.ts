/**
 * Builds an unsigned browser-facing download URL for a CDN / custom domain
 * bound to a private OSS bucket (e.g. Aliyun CDN private-bucket origin).
 *
 * When `S3_PUBLIC_ENDPOINT` is set, downloads must not use AWS SigV4 query
 * params: CDN origin auth adds `x-oss-security-token`, which conflicts with
 * S3-compatible signed URLs (Aliyun EC 0002-00000009).
 *
 * @param publicEndpoint - Base URL such as `https://img-dev.example.com`
 * @param key - Object key already including any path prefix
 */
export function buildPublicDownloadUrl(
    publicEndpoint: string,
    key: string,
): string {
    const base = publicEndpoint.trim().replace(/\/+$/, '');
    const path = key.replace(/^\/+/, '');
    return `${base}/${path}`;
}
