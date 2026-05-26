/** Shared fetch wrapper type for Lightdash REST client modules. */
export type RequestJsonFn = <T>(
    apiKey: string,
    urlPath: string,
    init?: RequestInit,
) => Promise<T>;
