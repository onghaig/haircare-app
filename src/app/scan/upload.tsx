import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Chips } from '@/components/onboarding/Controls';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { useScans } from '@/scan/ScanProvider';
import { analyseUpload, buildUploadRecord, exifCaptureDate, monthDate, UPLOAD_VIEWS, type UploadView } from '@/scan/upload';
import type { QualityReport } from '@modules/headmap';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

type Step =
  | { kind: 'pick' }
  | { kind: 'measuring'; uri: string }
  | { kind: 'refused'; uri: string; reason: string }
  | { kind: 'ready'; uri: string; report: QualityReport; aspect: number; exifDate: Date | null };

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const monthLabel = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const dayLabel = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Opens the library without cropping, so the measurements and the EXIF date stay intact. */
async function pickFromLibrary() {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: true });
  return res.canceled ? null : (res.assets[0] ?? null);
}

/**
 * Add a past photo from your library. It's measured on the phone like a scan photo, refused with
 * a plain reason when it can't be measured, and placed on your timeline at the date it was taken.
 */
export default function UploadPhotoScreen() {
  const { save } = useScans();
  const [view, setView] = useState<UploadView>('front');
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  // Photos without a date: the month you pick, starting at this month.
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setError(null);
    const asset = await pickFromLibrary();
    if (!asset) return;
    setStep({ kind: 'measuring', uri: asset.uri });
    const result = await analyseUpload(asset.uri, view);
    if (!result.ok) {
      setStep({ kind: 'refused', uri: asset.uri, reason: result.reason });
      return;
    }
    const [fw, fh] = result.report.frameSize ?? [asset.width, asset.height];
    setStep({
      kind: 'ready',
      uri: asset.uri,
      report: result.report,
      aspect: fw > 0 && fh > 0 ? fw / fh : 3 / 4,
      exifDate: exifCaptureDate(asset.exif, new Date()),
    });
  }

  const now = new Date();
  const chosen = monthDate(month.y, month.m);
  const canGoBack = month.y > 1990 || month.m > 0;
  const canGoForward = month.y < now.getFullYear() || month.m < now.getMonth();
  function shift(by: number) {
    const d = new Date(month.y, month.m + by, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  }

  async function add() {
    if (step.kind !== 'ready') return;
    setSaving(true);
    setError(null);
    try {
      const record = buildUploadRecord(step.report, {
        id: newId(),
        uri: step.uri,
        view,
        takenAt: step.exifDate ?? (chosen > now ? now : chosen),
        dateFrom: step.exifDate ? 'photo' : 'you',
      });
      const saved = await save(record);
      router.replace({ pathname: '/scan/[id]', params: { id: saved.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <SubScreen title="Add a past photo" close>
      {step.kind === 'pick' ? (
        <>
          <Text color="textMuted">Older photos show how your hair has changed. We measure them on your phone, the same way as a scan.</Text>
          <Text variant="headline">What does the photo show?</Text>
          <Chips options={[...UPLOAD_VIEWS]} selected={[view]} onToggle={setView} />
          <Text variant="caption" color="textMuted">
            Best: good light, in focus, hair dry and off your forehead.
          </Text>
          <Button label="Choose a photo" onPress={choose} />
        </>
      ) : (
        <PhotoPreview uri={step.uri} aspect={step.kind === 'ready' ? step.aspect : 3 / 4} curve={step.kind === 'ready' && view === 'front' ? step.report.hairline?.curve : undefined} />
      )}

      {step.kind === 'measuring' ? (
        <Text color="textMuted" accessibilityLiveRegion="polite">
          Measuring your photo…
        </Text>
      ) : null}

      {step.kind === 'refused' ? (
        <>
          <Card style={styles.refused} accessibilityLiveRegion="polite" testID="upload-refused">
            <Text variant="headline">This photo can’t be used</Text>
            <Text color="textMuted">{step.reason}</Text>
          </Card>
          <Button label="Choose another photo" onPress={choose} />
          <Button label="Change what it shows" variant="secondary" onPress={() => setStep({ kind: 'pick' })} />
        </>
      ) : null}

      {step.kind === 'ready' ? (
        <>
          <Card style={{ gap: spacing.xs }}>
            <Text variant="caption" color="accent">
              Photo measured
            </Text>
            {step.exifDate ? (
              <Text testID="upload-date">{`Taken ${dayLabel(step.exifDate)}, from the photo’s details.`}</Text>
            ) : (
              <>
                <Text testID="upload-date">No date in this photo. Roughly when was it taken?</Text>
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Earlier month"
                    disabled={!canGoBack}
                    onPress={() => shift(-1)}
                    style={[styles.stepBtn, !canGoBack && styles.dim]}>
                    <Text variant="headline">‹</Text>
                  </Pressable>
                  <Text variant="headline" style={{ flex: 1, textAlign: 'center' }} accessibilityLiveRegion="polite">
                    {monthLabel(chosen)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Later month"
                    disabled={!canGoForward}
                    onPress={() => shift(1)}
                    style={[styles.stepBtn, !canGoForward && styles.dim]}>
                    <Text variant="headline">›</Text>
                  </Pressable>
                </View>
                <View style={styles.years}>
                  <Button label="1 year earlier" variant="secondary" disabled={!canGoBack} onPress={() => shift(-12)} style={{ flex: 1 }} />
                  <Button label="1 year later" variant="secondary" disabled={!canGoForward} onPress={() => shift(Math.min(12, (now.getFullYear() - month.y) * 12 + now.getMonth() - month.m))} style={{ flex: 1 }} />
                </View>
              </>
            )}
            <Text variant="caption" color="textMuted">
              It goes on your timeline. Your weekly scans still set your baseline and verdict.
            </Text>
          </Card>
          {error ? <Text color="warning">{`Couldn’t save this photo: ${error}`}</Text> : null}
          <Button label={saving ? 'Saving…' : 'Add to your timeline'} disabled={saving} onPress={add} />
          <Button label="Choose another photo" variant="secondary" disabled={saving} onPress={choose} />
        </>
      ) : null}
    </SubScreen>
  );
}

function PhotoPreview({ uri, aspect, curve }: { uri: string; aspect: number; curve?: [number, number][] }) {
  const [w, setW] = useState(0);
  const h = w / aspect;
  const d = curve && curve.length > 1 ? `M${curve.map(([x, y]) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`).join(' L')}` : null;
  return (
    <View style={[styles.photo, { aspectRatio: aspect }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Your photo" />
      {d && w > 0 ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} testID="upload-trace">
          <Path d={d} stroke={colors.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', maxHeight: 420, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  refused: { gap: spacing.xs, borderColor: colors.warning },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  stepBtn: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  dim: { opacity: 0.4 },
  years: { flexDirection: 'row', gap: spacing.sm },
});
