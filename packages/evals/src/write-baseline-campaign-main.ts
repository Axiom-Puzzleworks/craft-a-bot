import { writeBaselineCampaign } from './write-baseline-campaign.js';

process.stdout.write(`wrote ${await writeBaselineCampaign()}\n`);
