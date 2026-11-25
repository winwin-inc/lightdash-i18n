/**
 * Umami 埋点会话标识。
 *
 * - installId：localStorage 持久化（每浏览器一个），localStorage 不可用时退化为内存值
 * - sessionId：sessionStorage（每标签页一个），同样有内存退化
 *
 * 本机 jsdom 缺 localStorage：所有 storage 访问都必须 try/catch 兜底，
 * 保持纯逻辑、无第三方依赖。
 */

const INSTALL_ID_STORAGE_KEY = 'lightdash.umami.install_id';
const SESSION_ID_STORAGE_KEY = 'lightdash.umami.session_id';

// storage 不可用时的内存退化值（每 JS 上下文一份）
let memoryInstallId: string | null = null;
let memorySessionId: string | null = null;

const randomId = (): string => {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
};

const getWindowStorage = (get: () => Storage): Storage | null => {
    try {
        const storage = get();
        // 某些环境（隐私模式/禁 cookie）访问 storage 属性即抛错
        if (storage === null || storage === undefined) return null;
        return storage;
    } catch {
        return null;
    }
};

const safeGetItem = (storage: Storage | null, key: string): string | null => {
    if (storage === null) return null;
    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
};

const safeSetItem = (
    storage: Storage | null,
    key: string,
    value: string,
): void => {
    if (storage === null) return;
    try {
        storage.setItem(key, value);
    } catch {
        // 忽略写入失败（配额/隐私模式）
    }
};

/** 浏览器级安装 id（'lightdash.umami.install_id'），匿名 distinct_id 用 */
export const getInstallId = (): string => {
    const storage = getWindowStorage(() => window.localStorage);
    const existing = safeGetItem(storage, INSTALL_ID_STORAGE_KEY);
    if (existing !== null && existing !== '') return existing;

    const id = randomId();
    if (storage === null) {
        // 退化：仅内存值
        if (memoryInstallId === null) memoryInstallId = id;
        return memoryInstallId;
    }
    safeSetItem(storage, INSTALL_ID_STORAGE_KEY, id);
    return id;
};

/** 标签页级会话 id（'lightdash.umami.session_id'），$event_session_id 用 */
export const getSessionId = (): string => {
    const storage = getWindowStorage(() => window.sessionStorage);
    const existing = safeGetItem(storage, SESSION_ID_STORAGE_KEY);
    if (existing !== null && existing !== '') return existing;

    const id = randomId();
    if (storage === null) {
        if (memorySessionId === null) memorySessionId = id;
        return memorySessionId;
    }
    safeSetItem(storage, SESSION_ID_STORAGE_KEY, id);
    return id;
};
