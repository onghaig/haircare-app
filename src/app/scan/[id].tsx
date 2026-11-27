import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HairlineNumbers } from '@/components/scan/HairlineNumbers';
import { HairQualityCard } from '@/components/scan/HairQualityCard';
import { StageEstimateCard } from '@/components/scan/StageEstimateCard';
import { Button, Card, Text } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { useScans } from '@/scan/ScanProvider';
import { estimateStage } from '@/scan/stageEstimate';
import { retakeSeconds } from '@/reveal/trust';
import { SCAN_ORDER, VIEW_LABEL, weakReason, weakViews } from '@/scan/session';
import { colors, spacing } from '@/theme';

type Confirm = 'delete' | 'redo' | null;

/** What happens to your baseline when this scan goes, so it's never a surprise. */
function baselineNote(isBaseline: boolean, othersLeft: number): string {
  if (!isBaseline) return '';
  return othersLeft > 0
    ? ' This is your baseline, so your next oldest scan becomes the baseline and your trends are measured from it.'
    : ' This is your baseline, so your next scan sets a new one.';
}

/** Scan complete: quality score, views captured, hairline numbers. Redo or delete it from here. */
export default function ScanResultScreen() {
  // `then=reveal`: a weak first scan, shown before the reveal so it can be fixed first.
  const { id, then } = useLocalSearchParams<{ id: string; then?: string }>();
  const { records, baseline, remove } = useScans();
  const { profile } = useProfile();
  const scan = records.find((r) => r.id === id);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deleted || (busy && !scan)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text accessibilityLiveRegion="polite">Scan deleted.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!scan) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text color="textMuted">Scan not found.</Text>
      </SafeAreaView>
    );
  }

  const isBaseline = baseline?.id === scan.id;
  const weak = scan.lowConfidence ? weakViews(scan) : [];
  const good = SCAN_ORDER.filter((v) => !weak.includes(v));
  const name = (v: (typeof SCAN_ORDER)[number]) => VIEW_LABEL[v].split(':')[0];
  const toReveal = then === 'reveal';

  function retakeWeak() {
    if (!scan) return;
    router.replace({ pathname: '/scan/session', params: { replaces: scan.id, only: weak.join(',') } });
  }
  function done() {
    if (toReveal) router.replace('/reveal/analysing');
    else router.dismissTo('/scan');
  }
  const othersLeft = records.filter((r) => r.id !== scan.id && !r.lowConfidence).length;

  async function deleteScan() {
    if (!scan) return;
    setBusy(true);
    setError(null);
    try {
      await remove(scan.id);
      setDeleted(true);
      router.dismissTo('/scan');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function redoScan() {
    if (!scan) return;
    // The old scan is only removed once the new one has saved, so backing out keeps it.
    router.replace({ pathname: '/scan/session', params: { replaces: scan.id } });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">
          {weak.length
            ? `${weak.length === 1 ? '1 view needs' : `${weak.length} views need`} a retake`
            : isBaseline
              ? 'Baseline saved'
              : 'Scan complete'}
        </Text>
        {weak.length ? (
          <>
            <Text color="textMuted">
              {good.length
                ? `The other ${good.length === 1 ? 'view is' : `${good.length} are`} good and kept. Retaking just ${weak.length === 1 ? 'this one' : 'these'} takes about ${retakeSeconds(weak.length)} seconds.`
                : 'None of the views could be measured this time. A retake in good light usually fixes it.'}
            </Text>
            <Card style={{ paddingVertical: 2 }} testID="weak-views">
              {weak.map((v, i) => (
                <View key={v} style={[styles.weakRow, (i < weak.length - 1 || good.length > 0) && styles.border]}>
                  <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600' }}>{name(v)}</Text>
                    <Text variant="caption" color="textMuted">
                      {weakReason(scan, v)}
                    </Text>
                  </View>
                </View>
              ))}
              {good.length ? (
                <View style={styles.weakRow}>
                  <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600' }}>{good.map(name).join(', ')}</Text>
                    <Text variant="caption" color="textMuted">
                      Sharp, well lit, kept
                    </Text>
                  </View>
                </View>
              ) : null}
            </Card>
          </>
        ) : (
          <View style={styles.chips}>
            {SCAN_ORDER.map((v) => (
              <View key={v} style={[styles.chip, !scan.views[v] && styles.chipMissing]}>
                <Text variant="caption" color={scan.views[v] ? 'accent' : 'textMuted'}>
                  {name(v)}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Card style={styles.quality}>
          <View>
            <Text variant="caption" color="textMuted">
              Scan quality
            </Text>
            {scan.lowConfidence ? (
              <Text variant="headline" style={{ fontSize: 22, lineHeight: 28 }} accessibilityLabel="Scan quality not measured yet">
                Not measured yet
              </Text>
            ) : (
              <Text variant="display" accessibilityLabel={`Scan quality ${scan.quality} out of 100`}>
                {scan.quality}
                <Text variant="headline" color="textMuted">
                  /100
                </Text>
              </Text>
            )}
          </View>
          <Text variant="caption" color="textMuted" style={{ flex: 1, textAlign: 'right' }}>
            {scan.lowConfidence
              ? 'Scans that can’t be measured are never counted in your trends.'
              : isBaseline
                ? 'Every future scan is compared with this one.'
                : 'Counts toward your trends.'}
          </Text>
        </Card>
        {weak.length ? (
          <>
            <Button label={`Retake ${weak.length === 1 ? '1 view' : `${weak.length} views`}`} onPress={retakeWeak} />
            <Button label={toReveal ? 'Keep it and see my forecast' : 'Keep it and finish'} variant="secondary" onPress={done} />
          </>
        ) : null}
        <StageEstimateCard estimate={estimateStage(scan, profile)} />
        <HairQualityCard scan={scan} />
        <HairlineNumbers scan={scan} baseline={baseline} />
        <Text variant="caption" color="textMuted">
          Changes smaller than a re-scan can tell apart show as no real change. Estimates for tracking, not a diagnosis.
        </Text>
        <Button
          label="See your scalp map"
          variant="secondary"
          onPress={() => router.push({ pathname: '/scan/panorama', params: { id: scan.id } })}
        />
        {weak.length ? null : <Button label={toReveal ? 'See my forecast' : 'Done'} onPress={done} />}

        {confirm ? (
          <Card style={[styles.confirm, confirm === 'delete' && styles.confirmDelete]} accessibilityLiveRegion="polite">
            <Text variant="headline" accessibilityRole="header">
              {confirm === 'delete' ? 'Delete this scan?' : 'Redo this scan?'}
            </Text>
            <Text color="textMuted">
              {confirm === 'delete'
                ? `Its photos and measurements are removed from this phone. This can’t be undone.${baselineNote(isBaseline, othersLeft)}`
                : `You’ll take all five views again. This scan is replaced once the new one is saved; close the scan to keep it.${baselineNote(isBaseline, othersLeft)}`}
            </Text>
            {error ? <Text color="warning">{`Couldn’t delete this scan: ${error}`}</Text> : null}
            <Button
              label={confirm === 'delete' ? (busy ? 'Deleting…' : 'Delete scan') : 'Start the redo'}
              variant={confirm === 'delete' ? 'destructive' : 'primary'}
              disabled={busy}
              onPress={confirm === 'delete' ? deleteScan : redoScan}
            />
            <Button label="Keep this scan" variant="secondary" disabled={busy} onPress={() => setConfirm(null)} />
          </Card>
        ) : (
          <View style={styles.manage}>
            <Button label="Redo this scan" variant="secondary" onPress={() => setConfirm('redo')} style={{ flex: 1 }} />
            <Button label="Delete this scan" variant="destructive" onPress={() => setConfirm('delete')} style={{ flex: 1 }} />
          </View>
        )}
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
  manage: { flexDirection: 'row', gap: spacing.sm },
  confirm: { gap: spacing.sm, borderColor: colors.warning },
  confirmDelete: { borderColor: colors.danger },
  weakRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: 10 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  quality: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});
