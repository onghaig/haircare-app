import fs from 'fs';
import path from 'path';

import { TABS, tabByRoute } from '@/navigation/tabs';

describe('tabs', () => {
  it('are the five tabs from the spec, in order', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Today', 'Scan', 'Progress', 'Predict', 'Ask']);
  });

  it('each has a route file, an iOS symbol and an Android icon', () => {
    for (const t of TABS) {
      expect(fs.existsSync(path.join(__dirname, '..', 'src', 'app', '(tabs)', `${t.route}.tsx`))).toBe(true);
      expect(t.sf).toBeTruthy();
      expect(t.md).toBeTruthy();
      expect(t.job.length).toBeGreaterThan(0);
    }
  });

  it('has unique routes', () => {
    expect(new Set(TABS.map((t) => t.route)).size).toBe(TABS.length);
  });

  it('looks up a tab by route and rejects unknown routes', () => {
    expect(tabByRoute('scan').label).toBe('Scan');
    // @ts-expect-error testing a bad route at runtime
    expect(() => tabByRoute('nope')).toThrow();
  });
});
