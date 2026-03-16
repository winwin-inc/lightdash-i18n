/**
 * Jaeger 追踪集成 - 条件创建 SpanProcessor，未配置端点时返回空数组
 */
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { JaegerFilterSpanProcessor } from './jaeger-filter-span-processor';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';

const zipkinEndpoint = process.env.OTEL_EXPORTER_ZIPKIN_ENDPOINT;
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName =
    process.env.OTEL_SERVICE_NAME || 'lightdash-backend';

const useZipkin = !!zipkinEndpoint;
const endpoint = useZipkin ? zipkinEndpoint : otlpEndpoint;

export function getJaegerSpanProcessors(): SpanProcessor[] {
    if (!endpoint) return [];

    let exporter: SpanExporter;
    if (useZipkin) {
        const zipkinUrl = String(zipkinEndpoint).endsWith('/api/v2/spans')
            ? zipkinEndpoint
            : `${String(zipkinEndpoint).replace(/\/$/, '')}/api/v2/spans`;
        exporter = new ZipkinExporter({
            url: zipkinUrl,
            serviceName,
        });
    } else {
        const traceEndpoint = String(otlpEndpoint).endsWith('/v1/traces')
            ? otlpEndpoint
            : `${String(otlpEndpoint).replace(/\/$/, '')}/v1/traces`;
        exporter = new OTLPTraceExporter({
            url: traceEndpoint,
        });
    }

    return [new JaegerFilterSpanProcessor(exporter)];
}
