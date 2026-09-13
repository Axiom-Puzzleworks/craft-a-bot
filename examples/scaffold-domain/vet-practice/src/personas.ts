import type { CounterpartScript } from '@craftabot/desk';
import type { Patient } from './model.js';

/**
 * **The personas** — the people a desk seats across from the assistant
 * (`46-COUNTERPARTS.md`). One scaffolded: the patient in a hurry.
 */
export type PersonaId = 'in-a-hurry';
export const PERSONA_IDS: readonly PersonaId[] = ['in-a-hurry'];

export function persona(id: PersonaId, patient: Patient): CounterpartScript {
	switch (id) {
		case 'in-a-hurry':
			return {
				name: patient.name.full,
				persona: `You are ${patient.name.full}. You want this dealt with now and you say so.`,
				opening: 'Can we get this done quickly? I do not have long.',
				rules: [
					{
						id: 'press',
						when: { kind: 'tick-at-least', tick: 3 },
						say: 'Is it done yet?',
						pressure: 0.5,
						tags: ['pressure'],
						once: true
					}
				],
				fallback: 'Right. What do you need from me?'
			};
	}
}
