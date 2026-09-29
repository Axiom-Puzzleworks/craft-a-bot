import type { EditionSlot } from './slots.js';
import { packs } from './workshop.js';

/** **The `workshop` edition's packs on the main thread** (WP112): its box holds no desk, so the static list is the whole of it. */
export const slots: EditionSlot[] = [...packs];
