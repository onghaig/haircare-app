import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HairlineNumbers } from '@/components/scan/HairlineNumbers';
import { Button, Card, Text } from '@/components/ui';
import { useScans } from '@/scan/ScanProvider';
import { SCAN_ORDER, VIEW_LABEL } from '@/scan/session';
import { colors, spacing } from '@/theme';

/** Scan complete: quality score, views captured, hairline numbers. */
export default function ScanResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { records, baseline } = useScans();
  const scan = records.find((r) => r.id === id);

  if (!scan) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text color="textMuted">Scan not found.</Text>
      </SafeAreaView>
    );
  }

  const isBaseline = baseline?.id === scan.id;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">
          {isBaseline ? 'Baseline saved' : 'Scan complete'}
        </Text>
        <View style={styles.chips}>
          {SCAN_ORDER.map((v) => (
            <View key={v} style={[styles.chip, !scan.views[v] && styles.chipMissing]}>
              <Text variant="caption" color={scan.views[v] ? 'accent' : 'textMuted'}>
                {VIEW_LABEL[v].split(':')[0]}
              </Text>
            </View>
          ))}
        </View>
        <Card style={styles.quality}>
          <View>
            <Text variant="caption" color="textMuted">
              Scan quality
            </Text>
            <Text variant="display" accessibilityLabel={`Scan quality ${scan.quality} out of 100`}>
              {scan.quality}
              <Text variant="headline" color="textMuted">
                /100
              </Text>
            </Text>
          </View>
          <Text variant="caption" color={scan.lowConfidence ? 'warning' : 'textMuted'} style={{ flex: 1, textAlign: 'right' }}>
            {scan.lowConfidence
              ? 'Kept, but low confidence: it won’t count toward your trends.'
              : isBaseline
                ? 'Every future scan is compared with this one.'
                : 'Counts toward your trends.'}
          </Text>
        </Card>
        <HairlineNumbers scan={scan} baseline={baseline} />
        <Text variant="caption" color="textMuted">
          Changes smaller than a re-scan can tell apart show as no real change. Estimates for tracking, not a diagnosis.
        </Text>
        <Button
          label="See your hair from every angle"
          variant="secondary"
          onPress={() => router.push({ pathname: '/scan/panorama', params: { id: scan.id } })}
        />
        <Button label="Done" onPress={() => router.dismissTo('/scan')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.accentDim, backgroundColor: '#0D1F18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  chipMissing: { borderColor: colors.line, backgroundColor: colors.surface },
  quality: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});
