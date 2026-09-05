import { serviceLineTools, type ToolDefinition } from '@craftabot/core';
import { weatherLine } from '../world/service-lines.js';

/**
 * The Connector brick's own tools (WP32 stage B, `14-…` §5.6) — since WP58
 * (`47-SERVICE-LINES.md` §4.1) synthesised by the registry from the Weather
 * Line at `registerPack`, one per operation under the same ids as before.
 * This export is the same synthesis for the pack's own tests; it is **not**
 * in `starterTools`, because the registry would then meet each id twice.
 */
export const connectorTools: ToolDefinition[] = serviceLineTools('starter', weatherLine);
