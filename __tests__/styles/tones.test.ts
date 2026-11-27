import { DEFAULT_TONES, sampleTones } from '@/look/tones';

/** A 100 x 100 photo: dark hair above y = 0.4, skin below. */
function photo() {
  const width = 100;
  const height = 100;
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const [r, g, b] = y < 40 ? [40, 30, 20] : [200, 150, 120];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return { width, height, data };
}

describe('colours for the free preview', () => {
  it('reads skin under the hairline and hair above it, from the photo itself', () => {
    const t = sampleTones(photo(), [[0.3, 0.42], [0.5, 0.4], [0.7, 0.42]]);
    expect(t).toEqual({ skin: '#c89678', hair: '#281e14' });
  });

  it('falls back when the hairline sits off the photo', () => {
    expect(sampleTones(photo(), [[0.3, 1.2], [0.7, 1.2]]).skin).toBe(DEFAULT_TONES.skin);
  });
});
