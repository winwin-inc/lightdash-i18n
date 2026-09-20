import type { Response } from 'express';

/**
 * Ensure JSON / SSE / plain text responses declare UTF-8.
 * Does not change status, body, or other headers — only appends charset when missing.
 * Helps Python requests and similar clients that otherwise default text/* to Latin-1.
 */
export function ensureContentTypeUtf8Charset(res: Response): void {
    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = ((
        name: string,
        value: number | string | readonly string[],
    ) => {
        if (String(name).toLowerCase() === 'content-type') {
            const raw = Array.isArray(value) ? value.join(', ') : String(value);
            const lower = raw.toLowerCase();
            const needsCharset =
                (lower.startsWith('application/json') ||
                    lower.startsWith('text/event-stream') ||
                    lower.startsWith('text/plain')) &&
                !lower.includes('charset=');
            if (needsCharset) {
                return originalSetHeader(name, `${raw}; charset=utf-8`);
            }
        }
        return originalSetHeader(name, value);
    }) as typeof res.setHeader;
}

/** Pure helper for tests: append charset when appropriate. */
export function withUtf8Charset(contentType: string): string {
    const lower = contentType.toLowerCase();
    const needsCharset =
        (lower.startsWith('application/json') ||
            lower.startsWith('text/event-stream') ||
            lower.startsWith('text/plain')) &&
        !lower.includes('charset=');
    return needsCharset ? `${contentType}; charset=utf-8` : contentType;
}
