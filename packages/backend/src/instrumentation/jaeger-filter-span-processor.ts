/**
 * Jaeger 按需过滤 SpanProcessor：仅当 span 含有 jaeger-debug-id 属性时导出到 Jaeger
 * 与 Express 中间件配合：中间件从 header 读取 jaeger-debug-id 并 setAttribute 到根 span
 */
import type { Context } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import {
    BatchSpanProcessor,
    type ReadableSpan,
    type SpanExporter,
    type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

export const JAEGER_DEBUG_ID_ATTR = 'jaeger-debug-id';

/** Span 在 onStart 中可写，需有 setAttribute */
type WritableSpan = ReadableSpan & {
    setAttribute: (key: string, value: string | number | boolean) => unknown;
};

function getJaegerDebugId(span: ReadableSpan): string | undefined {
    const val = span.attributes[JAEGER_DEBUG_ID_ATTR];
    if (val === undefined || val === null) return undefined;
    const str = String(val);
    return str.trim() || undefined;
}

/**
 * 包装 BatchSpanProcessor，仅导出带 jaeger-debug-id 的 span
 */
export class JaegerFilterSpanProcessor implements SpanProcessor {
    private readonly inner: BatchSpanProcessor;

    constructor(exporter: SpanExporter) {
        this.inner = new BatchSpanProcessor(exporter);
    }

    onStart(span: WritableSpan, parentContext: Context): void {
        // 若父 span 有 jaeger-debug-id，传播给子 span
        const parentSpan = trace.getSpan(parentContext);
        if (parentSpan) {
            const attrs = (parentSpan as any).attributes;
            const debugId = attrs?.[JAEGER_DEBUG_ID_ATTR];
            if (debugId !== undefined && debugId !== null && String(debugId).trim()) {
                span.setAttribute(JAEGER_DEBUG_ID_ATTR, String(debugId).trim());
            }
        }
        this.inner.onStart(span as Parameters<BatchSpanProcessor['onStart']>[0], parentContext);
    }

    onEnd(span: ReadableSpan): void {
        const debugId = getJaegerDebugId(span);
        if (debugId) {
            this.inner.onEnd(span);
        }
    }

    async forceFlush(): Promise<void> {
        return this.inner.forceFlush();
    }

    async shutdown(): Promise<void> {
        return this.inner.shutdown();
    }
}
