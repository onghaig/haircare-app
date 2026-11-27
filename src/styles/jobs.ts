import { stageStep } from '@/visualize/preview';
import type { AiJob } from '@/visualize/useAiPreview';

import type { StyleId } from './catalog';

/** A hairstyle on the user's photo. The stage is today's, so the model keeps the hairline honest. */
export function styleJob(style: StyleId, stage: number): AiJob {
  return { name: `style-${style}`, request: { kind: 'style', style, stage: stageStep(stage) } };
}

/** A transplant preview, scaled to today's stage. */
export function restoreJob(stage: number): AiJob {
  const s = stageStep(stage);
  return { name: `restore-s${s.toFixed(1)}`, request: { kind: 'restore', stage: s } };
}
