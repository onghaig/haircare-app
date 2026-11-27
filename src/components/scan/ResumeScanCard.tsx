import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { draftCount, draftRemaining } from '@/scan/draft';
import { useScans } from '@/scan/ScanProvider';
import { VIEW_LABEL } from '@/scan/session';
import { colors, spacing } from '@/theme';

/**
 * A scan left part-way, kept for a day. On the first scan it is the one thing between the person
 * and their forecast, so it says so.
 */
export function ResumeScanCard({ firstScan }: { firstScan: boolean }) {
  const { draft } = useScans();
  if (!draft) return null;
  const left = draftRemaining(draft);
  const n = left.length;
  return (
    <Card style={styles.hero} testID="resume-scan">
      <Text variant="caption" color="accent">
        {`${draftCount(draft)} of 5 photos saved`}
      </Text>
      <Text variant="headline">
        {firstScan
          ? `${n === 1 ? '1 view' : `${n} views`} left to see your forecast`
          : `Finish your scan: ${n === 1 ? '1 view' : `${n} views`} left`}
      </Text>
      <Text variant="caption" color="textMuted">
        {`Next: ${left.map((v) => VIEW_LABEL[v].split(':')[0]).join(', ')}`}
      </Text>
      <Button label="Continue scan" onPress={() => router.push({ pathname: '/scan/session', params: { resume: '1' } })} />
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm, backgroundColor: colors.surfaceRaised, borderColor: colors.accentDim },
});
