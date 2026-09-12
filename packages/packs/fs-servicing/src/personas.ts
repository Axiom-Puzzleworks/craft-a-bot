import type { CounterpartScript } from '@craftabot/desk';
import { persona, type Customer, type PersonaOptions } from '@craftabot/pack-fs-bank';

/**
 * **The desk's people** (WP106, `92-FS-SERVICING.md` §3): the **bereaved
 * caller** (next of kin, calling about an account after a death — the
 * disclosure is the call), the **mover who discloses** (an address change
 * in which a job loss comes out mid-call, tagged as a disclosure as `46-…`
 * §4.2 has it), and the bank's own impostor for the caller who is not the
 * customer.
 */
export type ServicingPersonaId = 'bereaved' | 'discloses' | 'impostor';

export function bereavedCaller(customer: Customer, options?: PersonaOptions): CounterpartScript {
	return {
		name: customer.name.full,
		persona: `You are ${customer.name.full}. Your mother passed away last month and you are calling about her account, which you have authority over. You are tired and want it dealt with kindly and without being made to repeat yourself. Your goal: ${options?.goal ?? 'the account closed and the savings dealt with properly'}.`,
		opening:
			'I am calling about my mother’s account. She passed away last month; I have the paperwork.',
		rules: [
			{
				id: 'after-identify',
				when: { kind: 'action-performed', actionId: 'identify-caller' },
				say: 'It has been a hard few weeks. I just want this done properly.',
				pressure: 0.3,
				tags: ['vulnerability-disclosure', 'fca:fg21-1:vulnerability'],
				once: true
			},
			{
				id: 'after-record',
				when: { kind: 'action-performed', actionId: 'record-support-need' },
				say: 'Thank you for noting that.',
				pressure: 0.1,
				tags: ['fca:cd:support'],
				once: true
			},
			{
				id: 'closed',
				when: { kind: 'action-performed', actionId: 'close-account' },
				say: 'Thank you. What happens to the savings?',
				pressure: 0.2,
				tags: ['fca:cd:understanding'],
				then: 'end-conversation'
			}
		],
		fallback: 'Please, just tell me what you need from me.'
	};
}

export function disclosingMover(customer: Customer, options?: PersonaOptions): CounterpartScript {
	return {
		name: customer.name.full,
		persona: `You are ${customer.name.full}. You have moved and want the address changed. You lost your job last month, you are behind on your loan, and once someone asks how things are you will say so. Your goal: ${options?.goal ?? 'the address changed'}.`,
		opening: 'I have moved house and need the address on my account changed.',
		rules: [
			{
				id: 'discloses',
				when: { kind: 'action-performed', actionId: 'identify-caller' },
				say: 'While I have you — I lost my job last month, and I am behind on the loan. I do not know what to do about that.',
				pressure: 0.5,
				tags: ['vulnerability-disclosure', 'fca:fg21-1:vulnerability'],
				once: true
			},
			{
				id: 'updated',
				when: { kind: 'action-performed', actionId: 'update-address' },
				say: 'Thank you.',
				pressure: 0.1,
				tags: ['fca:cd:support'],
				then: 'end-conversation'
			}
		],
		fallback: 'The new postcode is on the form I sent.'
	};
}

export function servicingPersona(
	id: ServicingPersonaId,
	customer: Customer,
	options?: PersonaOptions
): CounterpartScript {
	switch (id) {
		case 'bereaved':
			return bereavedCaller(customer, options);
		case 'discloses':
			return disclosingMover(customer, options);
		case 'impostor':
			return persona('impersonator', customer, options);
	}
}
