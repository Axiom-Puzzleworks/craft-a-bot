import { describe, expect, it } from 'vitest';
import { OPERATIONS, SERVICES, operationsFor } from './services.js';

describe('the services catalogue', () => {
	it('gives every operation a unique id within its own service, a real service, and a response', () => {
		const serviceIds = SERVICES.map((service) => service.id);
		for (const operation of OPERATIONS) {
			expect(serviceIds).toContain(operation.service);
			expect(operation.name.length).toBeGreaterThan(0);
			expect(operation.description.length).toBeGreaterThan(0);
			expect(operation.respond().length).toBeGreaterThan(0);
			expect(operation.failureChance).toBeGreaterThanOrEqual(0);
			expect(operation.failureChance).toBeLessThan(1);
		}
	});

	it('carries at least one operation per service, so a connected service is never empty', () => {
		for (const service of SERVICES) {
			expect(OPERATIONS.some((operation) => operation.service === service.id)).toBe(true);
		}
	});

	it('has no two operations sharing an id within the same service', () => {
		for (const service of SERVICES) {
			const ids = operationsFor(service.id).map((operation) => operation.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});

describe('operationsFor', () => {
	it('returns only the operations that belong to the named service', () => {
		for (const operation of operationsFor('weather')) {
			expect(operation.service).toBe('weather');
		}
	});
});
