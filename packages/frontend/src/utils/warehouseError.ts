/**
 * 仓库（数仓引擎）资源类错误识别。
 *
 * 典型报错由引擎返回、Lightdash 原样透传：
 *   internal error: hos_exception: [fragment_service.cc:360 ThrowException]
 *   HGERR_code 53200 HGERR_msge Total memory used by all existing queries
 *   exceeded memory limitation ...
 *
 * 这类错误是引擎侧的**全局**限额（所有 query 合计），不是本次请求本身的问题：
 * 一个大查询把额度占满后，其他并发查询会「连坐」被拒。
 * 用户侧只应看到友好提示，原始报文保留在日志 / networkHistory 里排查。
 */
const RESOURCE_LIMIT_PATTERNS = [
    /HGERR_code\s*53200/i,
    /hos_exception/i,
    /memory limitation/i,
    /exceeded memory/i,
    /out of memory/i,
    /mem[_ ]limit/i,
];

/**
 * 从各种形态的错误对象里取出可读文本。
 * 支持：string、Error、ApiError（{ error: { message } }）、react-query 错误包装。
 */
export const getErrorMessageText = (error: unknown): string => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (typeof error === 'object') {
        const maybeError = error as {
            message?: unknown;
            error?: { message?: unknown };
        };
        if (typeof maybeError.message === 'string') {
            return maybeError.message;
        }
        if (typeof maybeError.error?.message === 'string') {
            return maybeError.error.message;
        }
    }
    return '';
};

/**
 * 是否是仓库资源（内存）限额类错误
 */
export const isWarehouseResourceLimitError = (
    error: unknown,
): boolean => {
    const text = getErrorMessageText(error);
    if (!text) return false;
    return RESOURCE_LIMIT_PATTERNS.some((pattern) => pattern.test(text));
};
