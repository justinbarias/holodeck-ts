import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { ObservabilityConfig } from "../config/schema.js";

let activeProvider: LoggerProvider | undefined;

export function initOtelLoggerProvider(config: ObservabilityConfig): LoggerProvider {
	if (activeProvider) {
		activeProvider.shutdown().catch(() => {});
		activeProvider = undefined;
	}

	const serviceName = config.service_name ?? "holodeck";
	const endpoint = config.exporters?.otlp?.endpoint ?? "http://localhost:4318";

	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: serviceName,
	});

	const exporter = new OTLPLogExporter({
		url: `${endpoint}/v1/logs`,
	});

	const provider = new LoggerProvider({
		resource,
		processors: [new BatchLogRecordProcessor(exporter)],
	});

	activeProvider = provider;
	return provider;
}

export async function shutdownOtel(): Promise<void> {
	if (!activeProvider) {
		return;
	}
	const provider = activeProvider;
	activeProvider = undefined;
	await provider.shutdown();
}

export function getActiveLoggerProvider(): LoggerProvider | undefined {
	return activeProvider;
}
