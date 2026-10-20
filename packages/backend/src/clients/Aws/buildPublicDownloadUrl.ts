/**
 * Builds an unsigned browser-facing download URL for a CDN / custom domain
 * bound to a private OSS bucket (e.g. Aliyun CDN private-bucket origin).
 *
 * When `S3_PUBLIC_ENDPOINT` is set, downloads must not use AWS SigV4 query
 * params: CDN origin auth adds `x-oss-security-token`, which conflicts with
 * S3-compatible signed URLs (Aliyun EC 0002-00000009).
 *
 * The key is treated as raw object-storage bytes (it comes from file ids
 * built with `sanitizeGenericFileName`, which keep `%`, spaces, `?`, `#` and
 * non-ASCII characters verbatim). Each path segment is therefore percent-
 * encoded so the browser sends a valid request URL. Escaping `%` matters
 * most: a literal `%` in a chart name (e.g. "（%）") otherwise produces an
 * invalid percent-encoding sequence, which nginx/Tengine rejects with
 * `400 Bad Request`.
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
    const encodedPath = path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `${base}/${encodedPath}`;
}
