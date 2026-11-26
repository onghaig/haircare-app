import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  HeadMapCameraView,
  isHeadMapAvailable,
  requestCameraPermissionAsync,
  type HeadMapCameraViewRef,
} from '@modules/headmap';
import { HairChecklist } from '@/components/scan/HairChecklist';
import { HeadGuide } from '@/components/scan/HeadGuide';
import { PromptCard, StatusChips, ViewProgress } from '@/components/scan/ScanHud';
import { Button, Text } from '@/components/ui';
import { promptFor, statusChips } from '@/scan/guidance';
import { useScans } from '@/scan/ScanProvider';
import {
  buildScanRecord,
  currentView,
  initialScanState,
  scanReducer,
  TIPS,
  type HairState,
  VIEW_LABEL,
} from '@/scan/session';
import { VoiceCoach } from '@/scan/voice';
import { colors, spacing } from '@/theme';

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The guided five-view scan. Camera and checks are native; this screen is the HUD. */
export default function ScanSessionScreen() {
  const { baseline, records, save } = useScans();
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [voiceOn, setVoiceOn] = useState(false);
  const camera = useRef<HeadMapCameraViewRef>(null);
  const coach = useMemo(() => new VoiceCoach((line) => Speech.speak(line, { rate: 0.95 })), []);
  const view = currentView(state);

  // Finish: save and show the result.
  useEffect(() => {
    if (state.phase !== 'done') return;
    const record = buildScanRecord(state, newId(), new Date());
    save(record).then((saved) => router.replace({ pathname: '/scan/[id]', params: { id: saved.id } }));
  }, [state, save]);

  // Announce each new view; the crown is voice-guided because the user can't see the screen.
  useEffect(() => {
    if (state.phase !== 'capturing') return;
    if (view === 'crown' || voiceOn) coach.say(VIEW_LABEL[view], Date.now());
  }, [view, state.phase, voiceOn, coach]);

  async function start(hairState: HairState) {
    if (isHeadMapAvailable) {
      const p = await requestCameraPermissionAsync();
      setPermission(p);
      if (p !== 'granted') return;
    }
    dispatch({ type: 'start', hairState, now: Date.now() });
  }

  if (state.phase === 'checklist' || permission === 'denied') {
    return (
      <SafeAreaView style={styles.safe}>
        <CloseButton />
        {permission === 'denied' ? (
          <View style={styles.center}>
            <Text variant="title">Camera access is off</Text>
            <Text color="textMuted" style={{ textAlign: 'center' }}>
              The scan needs the camera to measure your hairline. Photos are analysed on your phone.
            </Text>
            <Button label="Open Settings" onPress={() => Linking.openSettings()} />
          </View>
        ) : (
          <HairChecklist firstScan={records.length === 0} onStart={start} />
        )}
      </SafeAreaView>
    );
  }

  const live = state.live;
  const prompt = live ? promptFor(live) : { title: 'Line up with the outline', tone: 'fix' as const, voice: '' };
  const ghost = baseline?.views[view]?.uri;
  const tip = state.tip ? TIPS[state.tip] : null;

  return (
    <View style={styles.camera} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <HeadMapCameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        view={view}
        baselineFaceWidth={baseline?.faceWidthPx ?? null}
        active={state.phase === 'capturing'}
        onQuality={({ nativeEvent }) => {
          dispatch({ type: 'quality', report: nativeEvent, now: Date.now() });
          coach.update(promptFor(nativeEvent).voice, Date.now(), view === 'crown' || voiceOn);
        }}
        onCapture={({ nativeEvent }) => dispatch({ type: 'captured', result: nativeEvent })}
      />
      {ghost && view !== 'crown' ? (
        <Image source={{ uri: ghost }} style={[StyleSheet.absoluteFill, { opacity: 0.28 }]} contentFit="cover" pointerEvents="none" />
      ) : null}
      <HeadGuide view={view} aligned={!!live?.allPassed} width={size.width} height={size.height} />

      <SafeAreaView style={styles.hud} pointerEvents="box-none">
        <View style={styles.top}>
          <CloseButton />
          <ViewProgress current={view} done={state.captures} />
          <Pressable
            onPress={() => setVoiceOn((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: voiceOn }}
            accessibilityLabel="Voice guidance"
            style={styles.pill}>
            <Text variant="caption" style={{ fontWeight: '600' }}>
              {voiceOn || view === 'crown' ? 'Voice on' : 'Voice off'}
            </Text>
          </Pressable>
        </View>
        <Text variant="headline" style={styles.viewTitle}>
          {VIEW_LABEL[view]}
        </Text>
        <View style={{ flex: 1 }} />
        <View style={styles.bottom}>
          <PromptCard prompt={prompt} tip={tip} />
          {live ? <StatusChips chips={statusChips(live)} /> : null}
          {view !== 'crown' ? (
            <Button label="Take photo now" variant="secondary" onPress={() => camera.current?.capture()} />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

function CloseButton() {
  return (
    <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close scan" style={styles.close}>
      <Text variant="headline">×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, padding: spacing.xl, gap: spacing.md, alignItems: 'center', justifyContent: 'center' },
  camera: { flex: 1, backgroundColor: '#000' },
  hud: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  viewTitle: { textAlign: 'center', marginTop: spacing.sm },
  bottom: { padding: spacing.lg, gap: spacing.md },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, minHeight: 32, justifyContent: 'center' },
});
