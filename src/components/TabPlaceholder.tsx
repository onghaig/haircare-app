import { Card, Screen, Text } from '@/components/ui';
import { tabByRoute, type TabRoute } from '@/navigation/tabs';

/** Holds a tab's place until its milestone builds the real screen. */
export function TabPlaceholder({ route, milestone }: { route: TabRoute; milestone: string }) {
  const tab = tabByRoute(route);
  return (
    <Screen title={tab.label}>
      <Card>
        <Text variant="headline">{tab.job}</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
          Coming in {milestone}.
        </Text>
      </Card>
    </Screen>
  );
}
