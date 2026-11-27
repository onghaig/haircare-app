/**
 * Hairstyles the try-on can ask for. The app sends only an id from this list; the wording the
 * model sees lives here, so callers can't send their own prompts. Ids match src/styles/catalog.ts.
 */
export const STYLE_PROMPTS: Record<string, string> = {
  buzz: 'a short, even buzz cut, about 6 mm all over',
  shaved: 'a clean-shaven head, with a natural, freshly shaved look',
  crew: 'a classic crew cut: short tapered sides, a little longer on top, neat',
  crop: 'a French crop: short faded sides, a short textured top with a straight, blunt fringe brushed forward',
  fringe: 'a textured fringe: short sides, a messy, piecey top brushed forward onto the forehead',
  caesar: 'a Caesar cut: short all over with a short, straight fringe combed forward',
  ivy: 'an Ivy League cut: short sides, a slightly longer top with a neat side part',
  sidepart: 'a classic side part: tapered sides, longer top combed to one side with a clear part',
  quiff: 'a quiff: short sides, a longer top swept up and back at the front for volume',
  slick: 'a slick back: longer top combed straight back with light shine, short sides',
  flow: 'a medium-length flow: hair grown out to about chin length, swept back and falling naturally',
};

export const STYLE_IDS = Object.keys(STYLE_PROMPTS);
