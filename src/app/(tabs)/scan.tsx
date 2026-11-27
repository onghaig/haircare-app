import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { HairlineNumbers } from '@/components/scan/HairlineNumbers';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useScans } from '@/scan/ScanProvider';
import { daysUntilNextScan } from '@/scan/store';
import { colors, spacing } from '@/theme';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ScanTab() {
  const { records, latest, baseline, loaded } = useScans();
  const due = daysUntilNextScan(records, new Date());
  const first = records.length === 0;

  return (
    <Screen title="Scan">
      <Card style={styles.hero}>
        <Text variant="caption" color="accent">
          {first ? 'Your first scan sets your baseline' : due === 0 ? 'Weekly scan due today' : `Next scan in ${due} day${due === 1 ? '' : 's'}`}
        </Text>
        <Text variant="headline">{first ? 'About 90 seconds, five views' : 'Same time, same spot'}</Text>
        <Button
          label={first ? 'Start your first scan' : 'Start weekly scan'}
          onPress={() => router.push('/scan/session')}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      {latest ? <HairlineNumbers scan={latest} baseline={baseline} /> : null}
      {latest && Object.keys(latest.views).length > 1 ? (
        <Button
          label="See your scalp map"
          variant="secondary"
          onPress={() => router.push({ pathname: '/scan/panorama', params: { id: latest.id } })}
        />
      ) : null}

      {loaded && records.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="headline">History</Text>
          {[...records].reverse().map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: '/scan/[id]', params: { id: r.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Scan from ${formatDate(r.takenAt)}, quality ${r.quality}`}>
              <Card style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text>{formatDate(r.takenAt)}</Text>
                  <Text variant="caption" color="textMuted">
                    {r.id === baseline?.id ? 'Baseline' : r.lowConfidence ? 'Low confidence' : `${Object.keys(r.views).length} views`}
                  </Text>
                </View>
                <Text variant="headline" color={r.lowConfidence ? 'warning' : 'text'}>
                  {r.quality}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#0D1F18', borderColor: colors.accentDim, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
