import { expect, test, type Page } from '@playwright/test';
import { BRICKS, skipTutorial } from './support.js';

/**
 * WP8: the Safety Brick's three rules, exercised through the real UI.
 *
 * Before WP8 every assertion in this file would have failed identically — the
 * brick's panel wrote its settings into the spec and the play route created its
 * session without any guardrails at all, so the dial, the checkboxes, and the
 * approval toggle were decoration. These tests are the standing proof that the
 * brick is wired to something.
 */

const KINDS = ['llm', 'sense', 'actions', 'memory', 'safety'] as const;

/** Build a bot with a Safety Brick fitted. */
async function buildWithSafetyBrick(page: Page, card = 'card-say-hello'): Promise<void> {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();

	for (const kind of KINDS) {
		await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
		await page.keyboard.press('Enter');
		for (let step = 0; step < 8; step++) {
			const said = await page.getByTestId('announcer').textContent();
			if (said?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
			await page.keyboard.press('ArrowDown');
		}
		await page.keyboard.press('Enter');
	}

	await page.getByTestId(card).click();
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });
}

/** Open the safety control panel (03-UI-UX-DESIGN.md §4.3). */
async function openSafetyPanel(page: Page): Promise<void> {
	await page.getByTestId('socket-safety').getByRole('button').click();
	await expect(page.getByTestId('brick-controls-safety')).toBeVisible();
}

async function go(page: Page): Promise<void> {
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
}

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the step budget dial stops the run with the Safety Brick end card', async ({ page }) => {
	// Deliberately a card with no demo plan: the scripted goals all finish inside
	// the dial's minimum of five turns (say-hello succeeds on turn four, because
	// the `say` *is* the goal), so only an unscripted bot can reach the budget.
	await buildWithSafetyBrick(page, 'card-tidy-the-blocks');
	await openSafetyPanel(page);
	await page.getByTestId('max-ticks').fill('5');
	await expect(page.getByTestId('brick-controls-safety')).toContainText('Step budget: 5 turns');

	await go(page);
	await page.getByTestId('play').click();

	const endCard = page.getByTestId('end-card');
	await expect(endCard).toBeVisible({ timeout: 20_000 });
	// Not "Ran out of steps": the builder's own rule stopped this, and the card
	// says so (08 §3, as amended in WP8).
	await expect(endCard).toHaveAttribute('data-outcome', 'STOPPED_BY_GUARDRAIL');
	await expect(endCard).toContainText('The Safety Brick did its job');
});

test('the gauge counts down the dial, not the engine floor', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);
	await page.getByTestId('max-ticks').fill('8');

	await go(page);
	// The floor is 30; showing that here would contradict the brick on the bench.
	await expect(page.getByTestId('steps-left')).toContainText('of 8');
});

test('a blocked action is refused, and the run carries on', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);

	const controls = page.getByTestId('brick-controls-safety');
	await controls.getByRole('checkbox', { name: 'Move' }).check();

	await go(page);
	await page.getByTestId('step').click();

	// The bot wanted to move; the rule said no and the run kept its legs.
	await expect(page.getByTestId('flight-recorder')).toContainText('Safety rule stopped it', {
		timeout: 10_000
	});
	await expect(page.getByTestId('end-card')).toBeHidden();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('end-card')).toBeHidden();
});

test('approval mode pauses for a person, who can allow the action', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);
	await page.getByTestId('brick-controls-safety').getByTestId('approval-everything').check();

	await go(page);
	await page.getByTestId('step').click();

	const card = page.getByTestId('approval-card');
	await expect(card).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId('approval-signature')).toContainText('move(');
	await expect(page.getByTestId('status-lamp')).toContainText('Paused');

	await page.getByTestId('approval-allow').click();
	await expect(card).toBeHidden();
	// Allowed, so the world actually changed.
	await expect(page.getByTestId('world-view')).toBeVisible();
});

/**
 * **The approval-fatigue fix, end to end** (`19-…` §8.3, WP24). "Before every
 * action" pauses for `move` — proven above. "Only for risky things" fits the
 * same brick with the same demo bot, whose first move is the same `move`, and
 * nobody is asked: `move` is `riskTier: 'observe'` (`14-…` §4.5), so the run
 * just goes.
 */
test('"risky" mode does not ask about a plain move', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);
	await page.getByTestId('brick-controls-safety').getByTestId('approval-risky').check();

	await go(page);
	await page.getByTestId('step').click();

	await expect(page.getByTestId('world-view')).toBeVisible();
	await expect(page.getByTestId('approval-card')).toBeHidden();
});

/**
 * What the run actually recorded, read out of storage rather than off the
 * screen. The Flight Recorder virtualises its rows — early ones are genuinely
 * not in the DOM once a few turns have passed — so counting what is rendered
 * counts the wrong thing. Storage is also the more useful comparison: it is an
 * independent record of the same events the ticker claims to summarise.
 */
async function traceCounts(page: Page): Promise<{ checks: number; saves: number }> {
	return page.evaluate(async () => {
		const open = indexedDB.open('craftabot');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			open.onsuccess = () => resolve(open.result);
			open.onerror = () => reject(open.error);
		});
		const rows = await new Promise<{ event: { type: string } }[]>((resolve, reject) => {
			const request = db.transaction('events').objectStore('events').getAll();
			request.onsuccess = () => resolve(request.result as never);
			request.onerror = () => reject(request.error);
		});
		db.close();
		const of = (type: string) => rows.filter((row) => row.event.type === type).length;
		return { checks: of('guardrail.checked'), saves: of('guardrail.tripped') };
	});
}

test('the Safety Brick says what it has been doing', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await go(page);

	// Nothing has been checked yet, so the brick says nothing rather than
	// announcing zero.
	await expect(page.getByTestId('safety-ticker')).toHaveCount(0);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('bot')).toBeVisible();

	const ticker = page.getByTestId('safety-ticker');
	await expect(ticker).toBeVisible();
	await expect(ticker).toContainText('Safety brick:');

	// The quiet success is the case worth showing: it checked, and there was
	// nothing to stop.
	await expect(ticker).toContainText('nothing to stop');
});

/**
 * §2.1's acceptance test, literally. A ticker whose numbers drifted from the
 * trace would be worse than no ticker — it would be the toy lying about the one
 * brick this project exists to make legible.
 */
test('the ticker counts match the trace counts', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await go(page);

	for (let step = 0; step < 4; step++) {
		if (await page.getByTestId('end-card').isVisible()) break;
		await page.getByTestId('step').click();
	}

	const shown = await page.getByTestId('safety-ticker').getAttribute('data-checks');
	const saves = await page.getByTestId('safety-ticker').getAttribute('data-saves');
	const recorded = await traceCounts(page);

	expect(Number(shown)).toBe(recorded.checks);
	expect(Number(saves)).toBe(recorded.saves);
	expect(recorded.checks).toBeGreaterThan(0);
});

/**
 * The approval card is the one place in the toy where a grown-up is asked to
 * take responsibility, so the question has to be legible (`16-…` §2.1).
 */
test('an approval names its arguments and explains why it is asking', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);
	await page.getByTestId('brick-controls-safety').getByTestId('approval-everything').check();

	await go(page);
	await page.getByTestId('step').click();

	await expect(page.getByTestId('approval-card')).toBeVisible({ timeout: 10_000 });

	/*
	 * With the argument names, not just the values. `move(north)` reads
	 * plausibly enough that nobody noticed they were missing; `put_down(block_a,
	 * shelf)` does not, and a person cannot answer a question they cannot parse.
	 */
	const signature = page.getByTestId('approval-signature');
	await expect(signature).toContainText('move(');
	await expect(signature).toContainText(':');

	// And the card can say why it is asking, for the grown-up who does not know.
	const why = page.getByTestId('approval-why');
	await expect(why).toBeVisible();
	await why.getByRole('group').or(why.locator('summary')).first().click();
	await expect(why).toContainText('ask first');
});

test('approval mode lets a person deny, and the bot is told why', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);
	await page.getByTestId('brick-controls-safety').getByTestId('approval-everything').check();

	await go(page);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('approval-card')).toBeVisible({ timeout: 10_000 });
	await page.getByTestId('approval-deny').click();

	await expect(page.getByTestId('approval-card')).toBeHidden();
	// A denial is information, not an ending: the run is still going.
	await expect(page.getByTestId('end-card')).toBeHidden();
});

/**
 * > **Amended 2026-08-13 (WP11):** the loop-breaker now comes fitted, where it
 * > used to arrive switched off. v1's rule counted identical calls whatever
 * > came of them, so it stopped a bot walking in a straight line, and shipping
 * > it off meant the reported hello-loop was the *default* experience
 * > (`12-…` C3). v2 exempts a `move` that worked, so the default is safe — and
 * > the builder can still take it away, which is the half that matters here.
 */
test('the loop-breaker comes fitted and can be switched off again', async ({ page }) => {
	await buildWithSafetyBrick(page);
	await openSafetyPanel(page);

	const controls = page.getByTestId('brick-controls-safety');
	const loopBreaker = controls.getByRole('checkbox', { name: 'Stop it going in circles' });

	await expect(loopBreaker).toBeChecked();
	await expect(page.getByTestId('repeat-limit')).toBeVisible();
	await expect(controls).toContainText('3 times in a row');

	// A control you can remove is still the builder's choice (08 §3).
	await loopBreaker.uncheck();
	await expect(page.getByTestId('repeat-limit')).toBeHidden();

	await loopBreaker.check();
	await expect(page.getByTestId('repeat-limit')).toBeVisible();

	await page.getByTestId('repeat-limit').fill('5');
	await expect(controls).toContainText('5 times in a row');

	// Persistence of the setting is a store concern and is covered
	// deterministically in `bench.svelte.test.ts` — asserting it here would race
	// the save debounce.
});
