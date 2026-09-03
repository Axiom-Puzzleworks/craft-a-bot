/**
 * The OTel mapping moved to `@craftabot/telemetry` (WP47, `35-TELEMETRY.md`
 * §4.2) so the headless host and every sink share it; this path stays for
 * one release so nothing in the workbench has to move at once.
 */
export {
	otelTraceFor,
	otelTraceForExport,
	otelTraceForGroup,
	type OtelSpan,
	type OtelTrace
} from '@craftabot/telemetry';
