// STUB: OpenTelemetry helpers used by AppGenerateService / AnalyticsModel.
// Accepts the upstream options-object signature so call sites typecheck.

export type TraceSpanOptions = {
    name: string;
    op?: string;
    attributes?: Record<string, unknown>;
};

export type TraceSpan = {
    setAttribute: (key: string, value: unknown) => void;
    setAttributes: (attributes: Record<string, unknown>) => void;
    setStatus: (status: unknown) => void;
    end: () => void;
    spanContext: () => unknown;
};

const noopSpan: TraceSpan = {
    setAttribute: () => {},
    setAttributes: () => {},
    setStatus: () => {},
    end: () => {},
    spanContext: () => ({}),
};

export function getOtelTraceHeaders(): Record<string, string> {
    return {};
}

export function getTraceHeaders(): Record<string, string> {
    return {};
}

export function runWithOtelSpanContext<T>(
    _options: TraceSpanOptions | string,
    fn: ((span: TraceSpan) => T) | (() => T),
): T {
    return (fn as (span: TraceSpan) => T)(noopSpan);
}

export function traceSpan<T>(
    _options: TraceSpanOptions | string,
    fn: ((span: TraceSpan) => T) | (() => T),
): T {
    return (fn as (span: TraceSpan) => T)(noopSpan);
}

export function continueTrace<T>(
    _headers: Record<string, string>,
    callback: () => T,
): T {
    return callback();
}

export const continueOtelTrace = continueTrace;

export function initOtelTracing(): void {}

export async function shutdownOtelTracing(): Promise<void> {}
