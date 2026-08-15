/**
 * The wave 1 art, keyed by the ids the world already uses (`22-…` §1).
 *
 * Every asset is imported `?raw` and handed out as markup rather than as a URL.
 * That is not a preference: `20-…` §3's contract is built on named groups —
 * `#face-slot`, `#icon-slot`, `#state-*`, `#emboss` — and on `--part-tint`, and
 * none of those can be reached through an `<img src>`. Inline, or the contract
 * is decoration.
 *
 * **This module is the only place a world id may be mapped to a picture.**
 * There used to be two places a block's letter could come from, and on
 * 2026-08-12 they disagreed: the grid drew the blue A block as a "C" while the
 * trace called it "a blue letter block (A)". `WorldView.glyphFor` was rewritten
 * to derive the letter rather than look it up for exactly that reason. The
 * filenames carry an `item-` prefix that the world's ids do not, so a second
 * mapping is once again available to drift — `assets.test.ts` asserts this one
 * against the pack's own ids so it cannot.
 */
import type { BotExpression } from '$lib/bot-expression.js';

import faceIdle from './bot/face-idle.svg?raw';
import faceThinking from './bot/face-thinking.svg?raw';
import faceHappy from './bot/face-happy.svg?raw';
import faceConfused from './bot/face-confused.svg?raw';
import faceCelebrating from './bot/face-celebrating.svg?raw';
import faceStopped from './bot/face-stopped.svg?raw';

import poseWalk from './bot/pose-walk.svg?raw';
import poseCarry from './bot/pose-carry.svg?raw';

import backdrop from './playroom/backdrop.svg?raw';
import toyChest from './playroom/toy-chest.svg?raw';
import shelf from './playroom/shelf.svg?raw';
import table from './playroom/table.svg?raw';
import teddyIdle from './playroom/teddy-idle.svg?raw';
import teddyHappy from './playroom/teddy-happy.svg?raw';

import itemSnack from './playroom/item-snack.svg?raw';
import itemBlockA from './playroom/item-block-a.svg?raw';
import itemBlockB from './playroom/item-block-b.svg?raw';
import itemBlockC from './playroom/item-block-c.svg?raw';
import itemRedKey from './playroom/item-red-key.svg?raw';
import itemBall from './playroom/item-ball.svg?raw';
import cellHighlight from './playroom/cell-highlight.svg?raw';

import fxDeniedStamp from './playroom/fx-denied-stamp.svg?raw';
import fxQuestionPuff from './playroom/fx-question-puff.svg?raw';
import fxConfetti from './playroom/fx-confetti.svg?raw';
import fxSparkle from './playroom/fx-sparkle.svg?raw';
import fxZzz from './playroom/fx-zzz.svg?raw';

import boxSticker from './brand/box-sticker.svg?raw';
import badgeRosette from './leaflet/badge-rosette.svg?raw';

/** The six `#face-slot` contents (`20-…` §5.1). 48 × 48, no background. */
export const BOT_FACES: Record<BotExpression, string> = {
	idle: faceIdle,
	thinking: faceThinking,
	happy: faceHappy,
	confused: faceConfused,
	celebrating: faceCelebrating,
	stopped: faceStopped
};

/**
 * The two bodies (`20-…` §5.2). Both carry `#face-slot` at the **same** origin,
 * so swapping pose does not move the face. `pose-carry` also carries
 * `#icon-slot`, where the carried item mounts at 48 × 48.
 *
 * Authored frontal rather than in profile. `22-…` §3.2 has the reasoning: the
 * brief asks for a side profile *and* for a shared slot with two-eyed frontal
 * faces, and those cannot both hold.
 */
export const BOT_POSES = { walk: poseWalk, carry: poseCarry } as const;

/** Where each empty slot sits, in the pose's own 96 × 96 coordinates. */
export const SLOT_ORIGINS = {
	'face-slot': { x: 24, y: 14, size: 48 },
	'icon-slot': { x: 24, y: 2, size: 48 }
} as const;

/** Scene items, keyed by the world's item ids — not by filename. */
export const SCENE_ITEMS: Record<string, string> = {
	snack: itemSnack,
	'block-a': itemBlockA,
	'block-b': itemBlockB,
	'block-c': itemBlockC,
	'red-key': itemRedKey,
	ball: itemBall
};

/** Furniture, keyed by `world.furniture[].id`. */
export const FURNITURE: Record<string, string> = { shelf, table };

/**
 * The chest is one file with three baked states (`20-…` §5.3). `#state-closed`
 * paints by default; the other two ship `display:none` and are switched on by
 * `data-state`, which `WorldView` already sets from `container.state`.
 */
export const CONTAINERS: Record<string, string> = { 'toy-chest': toyChest };

/** Teddy, keyed by `world.characters[].id`. Happy is shown on SUCCESS. */
export const CHARACTERS: Record<string, { idle: string; happy: string }> = {
	teddy: { idle: teddyIdle, happy: teddyHappy }
};

/**
 * The five effects (`20-…` §5.4). Every one reads as a complete static frame,
 * so `prefers-reduced-motion: reduce` leaves something meaningful on screen
 * rather than nothing — §7.10, and the reason it is worth honouring.
 */
export const EFFECTS = {
	deniedStamp: fxDeniedStamp,
	questionPuff: fxQuestionPuff,
	confetti: fxConfetti,
	sparkle: fxSparkle,
	zzz: fxZzz
} as const;

/** `#c1`…`#c12`, the twelve confetti particles the code animates individually. */
export const CONFETTI_PARTICLE_IDS = Array.from({ length: 12 }, (_, i) => `c${i + 1}`);

/** `#frame-1/2/3`; only `frame-1` is visible as delivered. */
export const SPARKLE_FRAME_IDS = ['frame-1', 'frame-2', 'frame-3'] as const;

/** Scene furniture: the room itself. 768 × 576, an 8 × 6 grid of 96 px cells. */
export const BACKDROP = backdrop;

/** The Playroom grid this backdrop is drawn for. Confirmed 2026-08-15. */
export const GRID = { cols: 8, rows: 6, cell: 96 } as const;

/** Target-cell cue. A frame, not a pad — it must not cover what it points at. */
export const CELL_HIGHLIGHT = cellHighlight;

/**
 * Tintable templates. Both expose a `#tint` shape whose fill is
 * `var(--part-tint, <token>)`, so setting the property recolours the part and
 * leaving it alone still renders correctly.
 */
export const TEMPLATES = { boxSticker, badgeRosette } as const;

/** Every delivered file, for the tests that check the set as a whole. */
export const ALL_ASSETS: Record<string, string> = {
	...Object.fromEntries(Object.entries(BOT_FACES).map(([k, v]) => [`face-${k}`, v])),
	'pose-walk': poseWalk,
	'pose-carry': poseCarry,
	backdrop,
	'toy-chest': toyChest,
	shelf,
	table,
	'teddy-idle': teddyIdle,
	'teddy-happy': teddyHappy,
	'item-snack': itemSnack,
	'item-block-a': itemBlockA,
	'item-block-b': itemBlockB,
	'item-block-c': itemBlockC,
	'item-red-key': itemRedKey,
	'item-ball': itemBall,
	'cell-highlight': cellHighlight,
	'fx-denied-stamp': fxDeniedStamp,
	'fx-question-puff': fxQuestionPuff,
	'fx-confetti': fxConfetti,
	'fx-sparkle': fxSparkle,
	'fx-zzz': fxZzz,
	'box-sticker': boxSticker,
	'badge-rosette': badgeRosette
};
