import type { PackManifest } from '@craftabot/core';
import { CALIBRATION } from './calibration.js';
import { vetPracticeControlMap } from './controls.js';
import { veterinaryPracticeDomain } from './domain.js';
import { vetPracticeLines } from './lines.js';

/**
 * @craftabot/pack-vet-practice — **Vet Practice**, scaffolded by
 * `craftabot scaffold domain` (WP107). The world pack: the model, the
 * calibration table, three service lines, the obligation vocabulary, the
 * control map, the personas, the domain spec. Content only.
 */
export const vetPracticePack: PackManifest = {
	id: 'vet-practice',
	name: 'Vet Practice (synthetic)',
	version: '0.1.0',
	requiresCore: '>=1.0.0',
	serviceLines: vetPracticeLines,
	controlMaps: [vetPracticeControlMap],
	calibrations: [CALIBRATION],
	domains: [veterinaryPracticeDomain]
};

export default vetPracticePack;
export { BANDS, patientFrom, type Patient } from './model.js';
export { CALIBRATION } from './calibration.js';
export { ledgerLine, recordLine, scheduleLine, vetPracticeLines } from './lines.js';
export { OBLIGATION_TAGS } from './obligations.js';
export { vetPracticeControlMap } from './controls.js';
export { PERSONA_IDS, persona, type PersonaId } from './personas.js';
export { DOMAIN_ID, veterinaryPracticeDomain } from './domain.js';
