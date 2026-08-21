import { expect, test, type Page } from '@playwright/test';
import { BRICKS, type BrickName } from './support.js';

/**
 * WP9's definition of done: **"Playwright walks all six chapters with the mock
 * provider; every designed teaching moment reachable."**
 *
 * `chapters.test.ts` proves the arc is walkable as a model. This proves it
 * survives the real DOM — and, more importantly, that each chapter's *failure*
 * genuinely happens before its fix. Those assertions are the ones that would
 * have failed before WP9 made the demo brain spec-aware.
 */

/** Fit a brick from the tray using the keyboard path (03 §4.4). */
async function fitBrick(page: Page, kind: BrickName): Promise<void> {
	await page.getByTestId(`tray-${BRICKS[kind].id}`).focus();
	await page.keyboard.press('Enter');
	for (let attempt = 0; attempt < 8; attempt++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes(`${BRICKS[kind].socket} socket — this one fits`)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
}

async function chooseCartridge(page: Page): Promise<void> {
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Demo Brain' });
}

async function go(page: Page): Promise<void> {
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
}

async function stepTimes(page: Page, times: number): Promise<void> {
	for (let turn = 0; turn < times; turn++) {
		const stepButton = page.getByTestId('step');
		if (!(await stepButton.isEnabled())) break;
		await stepButton.click();
		// The end card covers the controls once a run finishes.
		if (await page.getByTestId('end-card').isVisible()) break;
	}
}

/**
 * `stepTimes`, for a run whose Safety Brick still has "Before every action"
 * switched on (`08 §3`) — chapter 6 turns it on and nothing later turns it
 * back off, so every tick from chapter 7 onward proposes an action and pauses
 * for it. One `STEP` click starts a tick and reaches the pause; `approve-allow`
 * lets the paused action through and finishes it, which is what "one turn"
 * means here.
 */
async function stepPastApprovals(page: Page, times: number): Promise<void> {
	for (let turn = 0; turn < times; turn++) {
		const stepButton = page.getByTestId('step');
		if (!(await stepButton.isEnabled())) break;
		await stepButton.click();
		// The pause arrives once the model finishes thinking, not the instant
		// the click registers — waited for rather than polled once, so a still-
		// streaming reply is not mistaken for a tick with nothing to approve.
		// Short on purpose: the demo brain never touches the network, so a real
		// pause shows up in well under this, and a tool-call tick (never
		// approval-gated) should not cost this run a slow three-second wait.
		await page
			.getByTestId('approval-card')
			.waitFor({ state: 'visible', timeout: 800 })
			.then(() => page.getByTestId('approval-allow').click())
			.catch(() => {});
		if (await page.getByTestId('end-card').isVisible()) break;
	}
}

async function backToBench(page: Page): Promise<void> {
	const endCard = page.getByTestId('end-card');
	if (await endCard.isVisible()) {
		await page.getByTestId('end-see-trace').click();
	}
	await page.getByRole('link', { name: /Back to the bench/ }).click();
	await expect(page).toHaveURL(/\/bench\//);
}

const currentStep = (page: Page) =>
	page.locator('[data-testid^="leaflet-step-"][data-current="true"]');

test('the leaflet greets a first-timer and can be waved away', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByTestId('leaflet')).toBeVisible();
	await expect(page.getByTestId('leaflet-title')).toHaveText('A brain with no hands');
	await expect(currentStep(page)).toContainText('Take a new bot');

	await page.getByTestId('leaflet-skip').click();
	await expect(page.getByTestId('leaflet')).toBeHidden();
	await expect(page.getByTestId('leaflet-handle')).toBeVisible();

	// Skipping is remembered, but the handle always brings it back (03 §6).
	await page.reload();
	await expect(page.getByTestId('leaflet')).toBeHidden();
	await page.getByTestId('leaflet-handle').click();
	await expect(page.getByTestId('leaflet')).toBeVisible();
});

test('walks the six brick chapters plus Planner, If/Then and Librarian, and collects their badges', async ({
	page
}) => {
	test.slow();
	await page.goto('/');
	await expect(page.getByTestId('leaflet')).toBeVisible();

	// ── Chapter 1: a brain with no hands ──────────────────────────────────────
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	await expect(currentStep(page)).toContainText('Snap the Brain brick');

	await fitBrick(page, 'llm');
	await chooseCartridge(page);
	await expect(currentStep(page)).toContainText('Pull the GO lever');

	await go(page);
	await stepTimes(page, 2);

	// The designed failure, asserted rather than assumed: it decided to do
	// something and the world had no way to carry it out.
	await expect(page.getByTestId('flight-recorder')).toContainText('Decided');
	await expect(page.getByTestId('narration')).toContainText('not been built with any way');
	await expect(currentStep(page)).toContainText('brain with no hands');
	await page.getByTestId('leaflet-ack').click();

	await backToBench(page);
	await expect(currentStep(page)).toContainText('Actions brick');
	await fitBrick(page, 'actions');

	await go(page);
	await stepTimes(page, 2);
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 2: eyes open ──────────────────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('Eyes open');
	await page.getByTestId('leaflet-ack').click();

	await backToBench(page);
	await fitBrick(page, 'sense');
	await go(page);
	await stepTimes(page, 8);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 3: the goldfish problem ───────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('The goldfish problem');
	await backToBench(page);
	await page.getByTestId('card-snack').click();
	await go(page);
	await stepTimes(page, 3);

	await backToBench(page);
	await fitBrick(page, 'memory');
	await go(page);
	await stepTimes(page, 12);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 4: confidently wrong ──────────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('Confidently wrong');
	await backToBench(page);
	await page.getByTestId('card-sums-for-teddy').click();
	await go(page);
	// Four turns is exactly when it announces its answer; a fifth is `celebrate`,
	// which clears the speech bubble again.
	await stepTimes(page, 4);
	// The teaching moment: it says the wrong answer, and sounds certain.
	await expect(page.getByTestId('narration')).toContainText('371');
	await stepTimes(page, 1);

	await backToBench(page);
	await fitBrick(page, 'tools');
	await page.getByTestId('socket-equipment').getByRole('button').click();
	await page
		.getByTestId('brick-controls-equipment')
		.getByRole('checkbox', { name: /Calculator/ })
		.check();
	await go(page);
	await stepTimes(page, 8);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 5: looking things up ──────────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('Looking things up');
	await backToBench(page);
	await page.getByTestId('card-locked-chest').click();
	await go(page);
	await stepTimes(page, 4);

	await backToBench(page);
	await page.getByTestId('socket-equipment').getByRole('button').click();
	await page
		.getByTestId('brick-controls-equipment')
		.getByRole('checkbox', { name: /Look up the manual/ })
		.check();
	await go(page);
	await stepTimes(page, 3);
	// The lesson is the lookup, not the card: "The locked chest" also asks for a
	// full tidy, which needs more turns than the engine budget allows. The badge
	// is the assertion — the leaflet only awards it once the bot has actually
	// used `look_up_manual`. (The trace drawer is virtualised, so the row itself
	// has scrolled out of view by now.)
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 6: who says yes ───────────────────────────────────────────────
	await expect(page.getByTestId('leaflet-title')).toHaveText('Who says yes');
	await backToBench(page);
	await fitBrick(page, 'safety');
	await page.getByTestId('socket-safety').getByRole('button').click();
	await page.getByTestId('brick-controls-safety').getByTestId('approval-everything').check();

	await go(page);
	// Approval mode pauses for world actions, not tools — and this card opens
	// with `look_up_manual`. So step until it wants to change something.
	const approval = page.getByTestId('approval-card');
	for (let turn = 0; turn < 4 && !(await approval.isVisible()); turn++) {
		await page.getByTestId('step').click();
	}
	await expect(approval).toBeVisible();
	await page.getByTestId('approval-allow').click();

	// Four reading steps close chapter 6: the panel's other limits (`16-…` §2.2),
	// its spending cap (`14-…` §4.6, WP24) and the policy cards below them
	// (`14-…` §4.6, WP22).
	for (let step = 0; step < 4; step++) {
		await page.getByTestId('leaflet-ack').click();
	}

	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	/*
	 * Chapter 7 ("Turning the dials") is mostly reading rather than doing —
	 * its full step-by-step walk lives in `chapters.test.ts` alongside every
	 * other chapter's, so what follows here confirms only that the arc
	 * *reaches* it and clicks it closed on the way to chapter 8, rather than
	 * re-proving each of its four reading steps in a browser.
	 */
	await page.getByRole('link', { name: /Back to the bench/ }).click();
	await expect(page.getByTestId('baseplate')).toBeVisible();
	await expect(page.getByTestId('leaflet-title')).toHaveText('Turning the dials');
	await expect(currentStep(page)).toContainText('temperature dial');

	// The badge sheet, opened from the leaflet's own button. It used to be
	// reached through the "all chapters built" screen, which the arc no longer
	// hits at chapter 6 now that a seventh follows it.
	await page.getByTestId('leaflet-badges').click();

	for (const badge of [
		'first-words',
		'eyes-open',
		'elephant-memory',
		'tool-time',
		'key-finder',
		'safety-first'
	]) {
		await expect(page.getByTestId(`badge-${badge}`)).toHaveAttribute('data-earned', 'true');
	}

	// The same sheet points at the governance scenarios (`18-…` WP25) — no
	// badge, no tracking, just a reference the reader can act on later.
	for (const quest of [
		'the-warning-sign',
		'keep-the-secret',
		'busy-bot',
		'who-is-watching',
		'party-line',
		'false-alarm'
	]) {
		await expect(page.getByTestId(`side-quest-${quest}`)).toBeVisible();
	}

	// ── Chapter 7: turning the dials ──────────────────────────────────────────
	// The four reading steps, then the one genuinely checked control.
	for (let step = 0; step < 4; step++) {
		await page.getByTestId('leaflet-ack').click();
	}
	await expect(currentStep(page)).toContainText('notebook');
	await page.getByTestId('socket-memory').getByRole('button').click();
	await page
		.getByTestId('brick-controls-memory')
		.getByRole('checkbox', { name: /Notebook/ })
		.check();
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 8: think it through ───────────────────────────────────────────
	// WP30 stage D (`18-…` §3): the first chapter for a brick that joined after
	// the open contract, e2e'd in full like chapters 1–6 rather than only
	// "reached" the way chapter 7 was — the roadmap's own definition of done
	// for this WP.
	await expect(page.getByTestId('leaflet-title')).toHaveText('Think it through');
	await expect(currentStep(page)).toContainText('Tidy the blocks');

	await page.getByTestId('card-tidy-the-blocks').click();
	await go(page);
	// Approval mode is still on from chapter 6 — nothing in the arc turns it
	// back off, so every tick from here on pauses for a person before acting.
	await stepPastApprovals(page, 4);
	// The designed "failure": not a stalled run — the bot reaches the goal
	// either way. What is missing is legibility: no list, deciding turn by
	// turn. `demo-brain.ts`'s own `no-planner` variant thinks exactly that
	// out loud — the thought bubble shows the fourth turn's, deciding what
	// to fetch next rather than following a list.
	await expect(page.getByTestId('thought-text')).toContainText('while I am out here');

	await backToBench(page);
	await fitBrick(page, 'planner');
	await go(page);
	// `make_plan` is a tool, not a world action — like chapter 6's own
	// `look_up_manual`, it never pauses for approval, so the plain `stepTimes`
	// is enough for this first tick.
	await stepTimes(page, 1);
	// The checklist widget WP30 stage C built, showing the plan the bot just
	// laid out before taking a single real step.
	await expect(page.getByTestId('planner-checklist')).toContainText('Get the yellow block');

	// The rest of the run is real world actions (move, pick up, open, put
	// down, celebrate) interleaved with more tool calls — back to pausing for
	// approval on every one that actually moves anything.
	await stepPastApprovals(page, 20);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 9: skip the thinking ──────────────────────────────────────────
	// WP30's own If/Then sizing, stage C: a second chapter for a brick that
	// joined after the open contract. It reuses "Tidy the blocks" rather than
	// picking a new card — the run chapter 8 just finished is its own "watch
	// it think" evidence (the block sitting right in front of the bot on tick
	// 4 still cost a full think), so this chapter opens on an `ack` of that
	// run rather than forcing a second, identical one just to re-prove it.
	await expect(page.getByTestId('leaflet-title')).toHaveText('Skip the thinking');
	await expect(currentStep(page)).toContainText('stopped to think');
	await page.getByTestId('leaflet-ack').click();

	await expect(currentStep(page)).toContainText('Add the If/Then brick');
	await backToBench(page);
	await fitBrick(page, 'ifThen');

	// A rule, typed into the hand-written panel (WP30's If/Then sizing, stage
	// B) rather than pushed as config — the same real UI the reader has used
	// for every brick so far.
	const ifThenPanel = page.getByTestId('brick-controls-reflexes');
	await expect(currentStep(page)).toContainText('add a rule');
	await ifThenPanel.getByRole('button', { name: 'Add a rule' }).click();
	// The exact phrase matters (`chapters.ts`'s own comment on `add-rule`):
	// the full sight description keeps naming a held item in its own "You
	// are carrying…" line for as long as the bot holds it, so a rule
	// watching for the bare colour never stops matching once the pick-up
	// already happened — found live, as an endless `pick_up` loop.
	await ifThenPanel.getByLabel('If it sees').fill('east: a yellow letter block');
	await ifThenPanel.getByLabel('Then').selectOption({ label: 'Pick up (action)' });
	await ifThenPanel.getByLabel('The item').fill('yellow block');
	await page.getByTestId('leaflet-ack').click();

	await go(page);
	// Tick 1 is `make_plan` again — a tool, not gated by approval. Ticks 2
	// and 3 are the same approach moves (north, east) chapter 8's own run
	// made; tick 4 is where the rule now fires instead of the brain — still
	// gated by approval mode, exactly as a brain-driven action would be
	// (`if-then.test.ts`'s own pre-act guardrail case, walked here live).
	await stepTimes(page, 1);
	await stepPastApprovals(page, 3);
	await expect(currentStep(page)).toContainText('rest of the job');

	// The rest of the run is unchanged from chapter 8's own script — the rule
	// only ever covers the one thing it names, so everything else (the blue
	// block, opening the chest, celebrating) still goes through the brain.
	await stepPastApprovals(page, 20);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	// ── Chapter 10: ask before you guess ──────────────────────────────────────
	// WP32 stage C: a third chapter for a brick that joined after the open
	// contract, and the first that needed a genuinely new goal card — every
	// earlier chapter reused one already in the pack, and Librarian's own
	// lesson (a fact nowhere else in the world) had no existing card whose
	// win depended on one.
	await expect(page.getByTestId('leaflet-title')).toHaveText('Ask before you guess');
	await expect(currentStep(page)).toContainText('Hide and Seek Tip');

	await backToBench(page);
	await page.getByTestId('card-hiding-spot').click();
	await go(page);
	// Both scripted steps of the "no-librarian" run are world actions (say,
	// then celebrate) — approval mode is still on from chapter 6, so both
	// pause for a person. Checked one turn at a time, the same reason chapter
	// 4's own check is: the second turn's celebrate overwrites the narration,
	// so the wrong guess has to be read before it runs.
	await stepPastApprovals(page, 1);
	// The designed failure: a confident, wrong guess — "Sums for Teddy"'s own
	// shape (chapter 4), aimed at a fact instead of a sum.
	await expect(page.getByTestId('narration')).toContainText('under the table');
	await stepPastApprovals(page, 1);
	await expect(currentStep(page)).toContainText('Take the Scrapbook Brick off');

	await backToBench(page);
	// Librarian is `memory`'s other registered kind (`14-…` §5.5) — a
	// builder's choice of one against Scrapbook, so it has to come off first.
	// `socket-memory` is the testid on the socket's outer div (`Baseplate.svelte`);
	// the focusable, Delete-handling element is the button nested inside it.
	await page.getByTestId('socket-memory').getByRole('button').focus();
	await page.keyboard.press('Delete');
	await fitBrick(page, 'librarian');

	await page.getByTestId('socket-memory').getByRole('button').click();
	const librarianPanel = page.getByTestId('brick-controls-memory');
	// The generic schema panel's `idList` control (`SchemaPanel.svelte`) commits
	// on `onchange`, not `oninput` — unlike the hand-written If/Then panel above,
	// a `fill()` alone leaves the value sitting unsaved until the field blurs.
	await librarianPanel.getByLabel('Books').fill('games');
	await librarianPanel.getByLabel('Books').press('Tab');
	await expect(currentStep(page)).toContainText('checks the games book');

	await go(page);
	// Tick 1 is `library_games` — a tool, never gated by approval, the same
	// reason `make_plan` and `look_up_manual` never are. Tick 2 is the `say`
	// that actually wins the card, still gated.
	await stepTimes(page, 1);
	await stepPastApprovals(page, 1);
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await expect(page.getByTestId('badge-earned')).toBeVisible();
	await page.getByTestId('badge-dismiss').click();

	// Chapter 10 was the last one: the leaflet has already switched to its
	// own "all chapters built" screen, which shows every badge
	// unconditionally — no `leaflet-badges` toggle to click, unlike the
	// still-working-through-it view chapter 7's own check used.
	await expect(page.getByTestId('leaflet-title')).toHaveText('All 10 chapters built!');
	await expect(page.getByTestId('badge-planner-pro')).toHaveAttribute('data-earned', 'true');
	await expect(page.getByTestId('badge-quick-reflexes')).toHaveAttribute('data-earned', 'true');
	await expect(page.getByTestId('badge-well-read')).toHaveAttribute('data-earned', 'true');
});

/**
 * **The spotlight follows the reader between screens.**
 *
 * Reported from use: moving between screens with the tutorial open left the
 * highlight behind — a yellow rectangle and a dimmed hole sitting over a page
 * with nothing there.
 *
 * The cause: a step's anchor does not change when the reader navigates, so an
 * effect keyed only on the anchor never re-ran and the measurement stayed from
 * the previous page. The `resize` and `ResizeObserver` fallbacks only catch it
 * when the two screens happen to differ in height, which is why this asserts
 * the invariant rather than a position: **whatever the spotlight points at has
 * to exist on the screen the reader is actually looking at.**
 */
test('the spotlight never points at something on another screen', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('leaflet')).toBeVisible();

	const spotlight = page.getByTestId('leaflet-spotlight');
	await expect(spotlight).toBeVisible();
	await expect(spotlight).toHaveAttribute('data-anchor', 'new-bot');

	// Away to another screen. The step is unchanged — the reader has not taken a
	// bot off the shelf yet — so nothing about the anchor says the page moved.
	await page.getByTestId('nav-scrapbook').click();
	await page.waitForURL(/\/scrapbook/);
	await expect(page.getByTestId('scrapbook-list')).toBeVisible();

	// Either there is no hole, or it is over something that is really here.
	if ((await spotlight.count()) > 0) {
		const anchor = await spotlight.getAttribute('data-anchor');
		await expect(
			page.locator(`[data-tutorial="${anchor}"]`),
			`the spotlight is pointing at "${anchor}", which is not on this screen`
		).toHaveCount(1);
	}
});
