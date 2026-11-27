import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { isHeadMapAvailable } from '@modules/headmap';

import { Button, Card, Text } from '@/components/ui';
import {
  AMOUNT_LABEL,
  CURL_LABEL,
  DEFINITION_LABEL,
  DENSITY_LABEL,
  GREYS_LABEL,
  HAIR_NOTE,
  type HairAnalysis,
  type HairScore,
  type Reading,
} from '@/scan/hairAnalysis';
import { needsHairAnalysis } from '@/scan/hairRunner';
import type { ScanRecord } from '@/scan/session';
import { colors, radius, spacing } from '@/theme';

const PART_LABEL: Record<HairScore['parts'][number]['key'], string> = {
  thickness: 'Thickness',
  smoothness: 'Smoothness',
  shine: 'Shine',
};

interface Row {
  label: string;
  reading: Reading<string>;
  labels: Record<string, string>;
}

function rowsOf(h: HairAnalysis): Row[] {
  const q = h.quality;
  const rows: Row[] = [
    { label: 'Thickness on top', reading: h.density, labels: DENSITY_LABEL },
    { label: 'Curl pattern', reading: q.curl, labels: CURL_LABEL },
  ];
  if (q.definition) rows.push({ label: 'Curl definition', reading: q.definition, labels: DEFINITION_LABEL });
  rows.push(
    { label: 'Frizz', reading: q.frizz, labels: AMOUNT_LABEL },
    { label: 'Shine', reading: q.shine, labels: AMOUNT_LABEL },
    { label: 'Signs of dryness', reading: q.dryness, labels: AMOUNT_LABEL },
    { label: 'Grey hairs', reading: q.greys, labels: GREYS_LABEL },
  );
  return rows;
}

const valueOf = (row: Row) => (row.reading.value == null ? 'Can’t tell' : row.labels[row.reading.value]);

/** The part worth a screenshot: the score, its range, three bars and your hair type. No photos. */
function ScorePanel({ h }: { h: HairAnalysis }) {
  const s = h.score;
  const type = [h.quality.curl, h.quality.greys].every((r) => r.value == null)
    ? null
    : [
        h.quality.curl.value != null ? CURL_LABEL[h.quality.curl.value] : null,
        h.quality.greys.value != null && h.quality.greys.value !== 'none' ? `${GREYS_LABEL[h.quality.greys.value]} grey` : null,
      ]
        .filter(Boolean)
        .join(' · ');
  return (
    <View style={styles.panel}>
      <Text variant="caption" color="textMuted">
        Your hair score
      </Text>
      {s ? (
        <>
          <View style={styles.scoreRow}>
            <Text variant="display" accessibilityLabel={`Hair score ${s.value} out of 100, likely ${s.low} to ${s.high}, ${s.label}`}>
              {s.value}
              <Text variant="headline" color="textMuted">
                /100
              </Text>
            </Text>
            <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
              <View style={styles.badge}>
                <Text variant="caption" color="onAccent" style={{ fontWeight: '700' }}>
                  {s.label}
                </Text>
              </View>
              <Text variant="caption" color="textMuted">{`Likely ${s.low} to ${s.high}`}</Text>
            </View>
          </View>
          {s.parts.map((p) => (
            <View key={p.key} style={styles.bar} accessible accessibilityLabel={`${PART_LABEL[p.key]} ${Math.round(p.score * 10)} out of 10`}>
              <Text variant="caption" style={styles.barLabel}>
                {PART_LABEL[p.key]}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(4, Math.round(p.score * 100))}%` }]} />
              </View>
            </View>
          ))}
        </>
      ) : (
        <Text color="textMuted">Not enough could be read for a score this time. The details are below.</Text>
      )}
      {type ? <Text style={{ fontWeight: '600' }}>{type}</Text> : null}
      <Text variant="caption" color="textMuted">
        An estimate from phone photos, not a diagnosis.
      </Text>
    </View>
  );
}

/** Hair quality and thickness read from a scan's photos: a shareable score, then each trait with how sure it is. */
export function HairQualityCard({ scan }: { scan: ScanRecord }) {
  const panel = useRef<ComponentRef<typeof View>>(null);
  const [error, setError] = useState<string | null>(null);
  const h = scan.hair;

  if (!h) {
    const pending = needsHairAnalysis(scan) && isHeadMapAvailable;
    return (
      <Card style={styles.card} testID="hair-quality">
        <Text variant="caption" color="textMuted">
          Your hair score
        </Text>
        {pending ? (
          <View style={styles.pending} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.accent} />
            <Text color="textMuted">Reading your hair from the photos…</Text>
          </View>
        ) : (
          <Text color="textMuted">Not enough clear photos of your hair in this scan to read it.</Text>
        )}
      </Card>
    );
  }

  async function share() {
    if (!panel.current) return;
    setError(null);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
      const uri = await captureRef(panel, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'My hair score', UTI: 'public.png' });
    } catch {
      setError('Sharing isn’t available right now. Try a screenshot instead.');
    }
  }

  return (
    <Card style={styles.card} testID="hair-quality">
      <View ref={panel} collapsable={false} style={{ backgroundColor: colors.surface }}>
        <ScorePanel h={h} />
      </View>
      {h.score ? <Button label="Share my hair score" variant="secondary" onPress={share} /> : null}
      {error ? <Text color="warning">{error}</Text> : null}
      <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
        The details
      </Text>
      {rowsOf(h).map((row, i, all) => {
        const r = row.reading;
        const sure = r.value == null ? null : r.sure === 'fair' ? 'Fair guess' : 'Rough guess';
        return (
          <View
            key={row.label}
            style={[styles.row, i < all.length - 1 && styles.border]}
            accessible
            accessibilityLabel={`${row.label}: ${valueOf(row)}${sure ? `, ${sure.toLowerCase()}` : ''}`}>
            <View style={styles.line}>
              <Text style={{ flex: 1 }}>{row.label}</Text>
              <Text style={{ fontWeight: '600' }} color={r.value == null ? 'textMuted' : 'text'}>
                {valueOf(row)}
              </Text>
            </View>
            <Text variant="caption" color="textMuted">
              {r.value == null ? r.reason : sure}
            </Text>
          </View>
        );
      })}
      {h.caveats.map((c) => (
        <Text key={c} variant="caption" color="warning">
          {c}
        </Text>
      ))}
      <Text variant="caption" color="textMuted">
        {`A photo can’t show split ends or count hairs. ${HAIR_NOTE}`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  panel: { gap: spacing.sm, paddingVertical: spacing.xs },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { width: 86 },
  track: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  pending: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { paddingVertical: 8, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
