import { describe, expect, it } from 'vitest';
import * as core from './index.js';

describe('@craftabot/core public API', () => {
	it('exposes the working utilities', () => {
		expect(typeof core.createEventBus).toBe('function');
		expect(typeof core.createPackRegistry).toBe('function');
		expect(typeof core.validateSpec).toBe('function');
	});

	it('exposes the schema parse helpers', () => {
		expect(typeof core.parseAgentSpec).toBe('function');
		expect(typeof core.safeParseAgentSpec).toBe('function');
		expect(typeof core.parseEngineEvent).toBe('function');
		expect(typeof core.parseKitFile).toBe('function');
		expect(typeof core.migrateKitFile).toBe('function');
		expect(typeof core.parseTraceFile).toBe('function');
		expect(typeof core.computeTraceDigest).toBe('function');
	});

	it('exposes the Zod schema objects themselves', () => {
		expect(core.agentSpecSchema).toBeDefined();
		expect(core.engineEventSchema).toBeDefined();
		expect(core.kitFileSchema).toBeDefined();
		expect(core.traceFileSchema).toBeDefined();
		expect(core.brickDefinitionSchema).toBeDefined();
		expect(core.toolDefinitionSchema).toBeDefined();
		expect(core.cartridgeDefinitionSchema).toBeDefined();
		expect(core.goalCardDefinitionSchema).toBeDefined();
	});
});
