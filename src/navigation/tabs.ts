/**
 * The five tabs from the spec. Each has one job. Order matters: it is the tab bar order.
 * `route` is the file name under src/app/(tabs)/.
 */
export const TABS = [
  { route: 'index', label: 'Today', job: 'Tell me what to do right now', sf: 'checkmark.circle', md: 'check_circle' },
  { route: 'scan', label: 'Scan', job: 'Capture my head the same way every time', sf: 'viewfinder', md: 'center_focus_strong' },
  { route: 'progress', label: 'Progress', job: 'Show me whether I am winning', sf: 'chart.line.uptrend.xyaxis', md: 'insights' },
  { route: 'predict', label: 'Predict', job: 'Show me where I am heading', sf: 'sparkles', md: 'auto_awesome' },
  { route: 'ask', label: 'Ask', job: 'Answer my questions, including about photos', sf: 'bubble.left', md: 'chat_bubble' },
] as const;

export type TabRoute = (typeof TABS)[number]['route'];

export function tabByRoute(route: TabRoute) {
  const t = TABS.find((x) => x.route === route);
  if (!t) throw new Error(`Unknown tab ${route}`);
  return t;
}
