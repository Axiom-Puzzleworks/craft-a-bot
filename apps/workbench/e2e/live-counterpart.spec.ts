import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { awaitDuoSaved, buildDeskBot, buildReadyBot, skipTutorial } from './support.js';

/**
 * **A live seat in the Workshop** (WP64, `56-…` §4.4, §11 item 5): the
 * second robot at the Front Desk on an Ollama cartridge — keyless, so
 * "free" — plays the visitor live, with Ollama stubbed; the episode is
 * saved and leaves the Audit Centre as one bundle with both seats and a
 * transcript. And the Spec Lab fits the Compliance Watchbot stack on a
 * desk bot from what its desk ships.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

async function stubOllama(page: Page): Promise<void> {
	await page.route('http://localhost:11434/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body:
				`data: ${JSON.stringify({ choices: [{ delta: { content: 'Just here to sign in, thanks.' } }] })}\n\n` +
				`data: ${JSON.stringify({ choices: [{ finish_reason: 'stop' }] })}\n\n` +
				'data: [DONE]\n\n'
		});
	});
}

test('a second robot on Ollama plays the visitor live, and the episode exports as a bundle with both seats', async ({
	page
}) => {
	await stubOllama(page);
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	const clerk = await buildDeskBot(page);
	const visitor = await buildDeskBot(page);
	// The visitor thinks with a local model: keyless, and live (`56-…` §2 item 12).
	await page.getByTestId('socket-brain').getByRole('button').click();
	await page.getByTestId('cartridge-select').selectOption({ label: 'Quick Llama' });
	await page.waitForTimeout(300);

	await page.goto(`/play/duo?a=${clerk}&b=${visitor}&card=workshop/sign-the-visitor-in`);
	const roles = page.getByTestId('duo-roles');
	await expect(roles).toContainText('is the visitor');
	await expect(roles).toHaveAttribute('data-seat', 'live');
	await expect(roles).toContainText('Quick Llama');

	await page.getByTestId('play').click();
	await expect(page.getByTestId('duo-finished')).toBeVisible({ timeout: 30_000 });
	await awaitDuoSaved(page);

	// The Audit Centre: the episode as one bundle.
	await page.goto('/workshop/runs');
	const groupRow = page.locator('[data-testid^="group-row-"]').first();
	await expect(groupRow).toBeVisible();
	const groupId = (await groupRow.getAttribute('data-testid'))?.replace('group-row-', '') ?? '';
	await page.goto(`/workshop/export?run=group:${groupId}`);
	await expect(page.getByTestId('export-group-head')).toBeVisible();
	const downloading = page.waitForEvent('download');
	await page.getByTestId('export-download-bundle').click();
	const download = await downloading;
	expect(download.suggestedFilename()).toMatch(/\.craftabot-bundle\.json$/);
	const bundle = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8')) as {
		format: string;
		runs: Array<{ run: { id: string; agentName: string } }>;
		group?: {
			record: { memberRunIds: string[] };
			events: Array<{ type: string; payload: unknown }>;
		};
	};
	expect(bundle.format).toBe('craftabot-bundle');
	expect(bundle.runs).toHaveLength(2);
	expect(bundle.group?.record.memberRunIds).toHaveLength(2);
	// Both voices on the transcript the bundle carries: the visitor's opening, the clerk's line.
	const changed = [...(bundle.group?.events ?? [])]
		.reverse()
		.find((event) => event.type === 'world.changed');
	const transcript = (changed?.payload as { state: { transcript: Array<{ speaker: string }> } })
		.state.transcript;
	expect(transcript.some((line) => line.speaker === 'counterpart')).toBe(true);
	expect(transcript.some((line) => line.speaker === 'agent')).toBe(true);
});

test('the Robot Friends picker names who sits across a desk card', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await buildDeskBot(page);
	const second = await buildDeskBot(page);
	await page.goto(`/bench/${second}`);
	await page.getByTestId('robot-friends-lever').click();
	await expect(page.getByTestId('robot-friends-picker')).toBeVisible();
	await expect(page.getByTestId('rf-visitor-workshop/sign-the-visitor-in')).toContainText(
		'across the desk'
	);
});

test('the Spec Lab fits the Compliance Watchbot stack on an Advice Desk bot, and refuses it in a room', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	const agentId = await buildReadyBot(page, 'card-fs-advice/advise-inheritance');
	await page.goto(`/workshop/spec/${agentId}`);
	await expect(page.getByTestId('stack-plan')).toContainText('fs-advice/');
	await page.getByTestId('apply-stack').click();
	await expect(page.getByTestId('stack-readback')).toContainText('Compliance Watchbot');
	await expect(page.getByTestId('safety-stack')).toContainText('monitor/watchbot');
	await expect(page.getByTestId('safety-stack')).toContainText('workshop/monitor-judge');
	await expect(page.getByTestId('stack-capacity')).toContainText('4 of 4');

	const roomBot = await buildReadyBot(page, 'card-snack');
	await page.goto(`/workshop/spec/${roomBot}`);
	await expect(page.getByTestId('stack-unavailable')).toContainText('room');
	await expect(page.getByTestId('apply-stack')).toBeDisabled();
});
