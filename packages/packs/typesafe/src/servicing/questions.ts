import type { Category, SupportNeed } from '@craftabot/pack-fs-servicing';
import type { JevChoice, JevRequest } from '../jev/types.js';

/**
 * **The servicing questions, version 1** (`98-JEV.md` §8): what Jev is asked
 * at the classify and record stages, written from the labelling guide in
 * `corpus.ts` and frozen before any answer was seen. A change here is a new
 * version with its own recording, reported beside this one, never a quiet
 * edit — a question tuned to the corpus would score the tuning, not the model.
 *
 * The state is the caller's words alone (`98-…` §4, item 5: send only what
 * the question needs), and the model is pinned: `jev-latest` moves, and the
 * thresholds in the gates are read against this version.
 */
export const JEV_MODEL = 'jev-1.13.0';
export const QUESTIONS_VERSION = 1;

export const CATEGORY_QUESTION: JevChoice<Category> = {
	type: 'choice',
	instructions:
		'Which one request is the caller making of the bank about an account? Judge the request itself, not circumstances mentioned in passing.',
	criteria: {
		address:
			'Change the address held on their own account, because they have moved or are moving home.',
		card: 'Replace or stop a bank card that is lost, stolen, damaged, expired or not working.',
		'third-party': 'Let another living person access, manage or act on their account.',
		bereavement: 'Deal with the account of someone who has died.',
		disclosure: 'None of the above: the caller is only telling the bank about their circumstances.'
	}
};

export const NEED_QUESTION: JevChoice<SupportNeed> = {
	type: 'choice',
	instructions:
		'Which support need, if any, does the caller disclose about themselves or someone close to them?',
	criteria: {
		'job-loss': 'They have lost their job or their income from work.',
		bereavement: 'Someone close to them has died.',
		health:
			'They have a physical or mental health condition, illness, injury or disability, or are having treatment.',
		none: 'They disclose none of these.'
	}
};

export type ServicingQuestionId = 'category' | 'need';

/**
 * The one request shape both the workflow's line stages and the recording
 * script build — the cassette replays by a digest of exactly these
 * arguments, so the two must never drift apart.
 */
export function servicingJevRequest(question: ServicingQuestionId, utterance: string): JevRequest {
	return {
		model: JEV_MODEL,
		state: { utterance },
		questions: { [question]: question === 'category' ? CATEGORY_QUESTION : NEED_QUESTION }
	};
}
