import { REFERENCE_PHOTOS } from './referencePhotos.generated';

/**
 * Example photos made ahead of time with the image model (not real people), bundled with the
 * app, for when there's no AI image of the user's own photo. Labelled as examples wherever shown.
 */
export const REFERENCE_LABEL = 'Example photo, AI-made, not you';

/** Style photos come in three hairline bands: full, receding, thin on top. */
export function band(stage: number): 1 | 3 | 5 {
  return stage < 2.5 ? 1 : stage < 4.5 ? 3 : 5;
}

type Source = number;

export function stagePhoto(stage: number, photos: Record<string, Source> = REFERENCE_PHOTOS): Source | null {
  return photos[`stage-n${Math.min(7, Math.max(1, Math.round(stage)))}`] ?? null;
}

export function stylePhoto(style: string, stage: number, photos: Record<string, Source> = REFERENCE_PHOTOS): Source | null {
  return photos[`style-${style}-n${band(stage)}`] ?? null;
}

export function restorePhoto(stage: number, photos: Record<string, Source> = REFERENCE_PHOTOS): Source | null {
  return photos[`restore-n${band(stage)}`] ?? null;
}
