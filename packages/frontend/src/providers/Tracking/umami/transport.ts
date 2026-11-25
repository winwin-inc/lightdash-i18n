/**
 * Umami 埋点传输层（纯逻辑，不读模块级 window，配置全部从入参传入）。
 *
 * 协议见 docs/ops/umami-analytics.md §2：
 * - POST application/x-www-form-urlencoded（simple request，不触发预检）
 * - 单条 `data=<base64(json)>`，批量 `data_list=<base64(array)>&gzip=0`
 * - base64 必须 UTF-8 安全（组织名/页面名是中文），直接 btoa(JSON) 会抛
 *   InvalidCharacterError
 * - 永不抛错、不 await 阻塞 UI；页面隐藏时改用 sendBeacon
 */

export type UmamiSendConfig = {
    endpoint: string;
    project: string;
    token: string;
};

/** utf8 字节 → 二进制字符串（latin1 逐字节），供 btoa 使用 */
const utf8ToBinaryString = (input: string): string => {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return binary;
};

/** UTF-8 安全 base64：中文等多码点字符不会抛错 */
export const encodeUtf8Base64 = (input: string): string =>
    btoa(utf8ToBinaryString(input));

/**
 * 按码点（code point）截断，而不是 UTF-16 code unit：
 * 中文名/组织名是 BMP+ 字符混排，直接 slice 会把代理对拦腰截断产生乱码。
 */
export const truncateByCodePoints = (
    input: string,
    maxCodePoints: number,
): string => {
    // code point 数 ≤ UTF-16 length，短于上限时无需细查
    if (input.length <= maxCodePoints) return input;
    const codePoints = Array.from(input);
    if (codePoints.length <= maxCodePoints) return input;
    return codePoints.slice(0, maxCodePoints).join('');
};

const toUrlEncodedBase64 = (json: string): string =>
    encodeURIComponent(encodeUtf8Base64(json));

/** 单条事件：`data=<base64(json)>`（profile_set 等低频事件单独一包） */
export const encodeBody = (payload: unknown): string =>
    `data=${toUrlEncodedBase64(JSON.stringify(payload))}`;

/** 批量事件：`data_list=<base64(array)>&gzip=0`（一次导航 page_view + $AppViewScreen 两条一包） */
export const encodeBatchBody = (payloads: unknown[]): string =>
    `data_list=${toUrlEncodedBase64(JSON.stringify(payloads))}&gzip=0`;

export const buildCollectUrl = (config: UmamiSendConfig): string =>
    `${config.endpoint}?project=${encodeURIComponent(
        config.project,
    )}&token=${encodeURIComponent(config.token)}`;

const isPageHidden = (): boolean => {
    try {
        return document.visibilityState === 'hidden';
    } catch {
        return false;
    }
};

/**
 * 上报。所有网络失败静默（.catch 吞掉、外层 try 兜底），不 await、不阻塞 UI。
 * 页面隐藏（如即将离开页面）时用 sendBeacon，保证最后的埋点不丢。
 */
export const send = (config: UmamiSendConfig, body: string): void => {
    const url = buildCollectUrl(config);
    try {
        if (
            isPageHidden() &&
            typeof navigator.sendBeacon === 'function'
        ) {
            const blob = new Blob([body], {
                type: 'application/x-www-form-urlencoded',
            });
            if (navigator.sendBeacon(url, blob)) return;
        }
        void fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            keepalive: true,
            credentials: 'omit',
            mode: 'cors',
        }).catch(() => {
            // 静默：埋点失败不影响业务
        });
    } catch {
        // 永不抛错
    }
};
