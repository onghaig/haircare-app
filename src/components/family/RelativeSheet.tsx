import * as ImagePicker from 'expo-image-picker';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chips, type Option } from '@/components/onboarding/Controls';
import { Button, Text } from '@/components/ui';
import type { FamilyMember, HairStatus, Relative } from '@/profile/types';
import { colors, radius, spacing } from '@/theme';

import { MEMBER_NAME } from './FamilyTree';
import { RelativePhoto } from './RelativePhoto';

const STATUS_OPTIONS: Option<HairStatus>[] = [
  { value: 'full', label: 'Full head of hair' },
  { value: 'receding', label: 'Receding' },
  { value: 'thinning', label: 'Thinning' },
  { value: 'bald', label: 'Bald or mostly bald' },
  { value: 'unknown', label: 'Not sure' },
];

const START_AGES: Option<'20' | '30' | '40' | '50'>[] = [
  { value: '20', label: 'In their 20s' },
  { value: '30', label: 'In their 30s' },
  { value: '40', label: 'In their 40s' },
  { value: '50', label: '50 or later' },
];

/** Opens the photo library (no permission prompt on iOS 14+, the system picker runs out of process). */
export async function pickPhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  return res.canceled ? null : (res.assets[0]?.uri ?? null);
}

/** A relative's card: hair status, roughly when it started, and an optional photo. */
export function RelativeSheet({
  member,
  relative,
  onChange,
  onAddPhoto,
  onClose,
}: {
  member: FamilyMember | null;
  relative?: Relative;
  onChange: (r: Relative | undefined) => void;
  onAddPhoto: () => void;
  onClose: () => void;
}) {
  const status = relative?.status;
  const hasLoss = status === 'receding' || status === 'thinning' || status === 'bald';
  return (
    <Modal visible={member != null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        {member ? (
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="title">{MEMBER_NAME[member]}</Text>
            <Text variant="headline">Their hair</Text>
            <Chips
              options={STATUS_OPTIONS}
              selected={status ? [status] : []}
              onToggle={(v) => onChange({ ...relative, status: v })}
            />
            {hasLoss ? (
              <>
                <Text variant="headline">When did it start? (roughly)</Text>
                <Chips
                  options={START_AGES}
                  selected={relative?.startAge ? [String(relative.startAge) as '20'] : []}
                  onToggle={(v) => onChange({ ...relative!, startAge: relative?.startAge === Number(v) ? undefined : Number(v) })}
                />
              </>
            ) : null}
            <Text variant="headline">Photo (optional)</Text>
            <Text variant="caption" color="textMuted">
              Forehead visible, hair uncovered, roughly front-on. Ideally at about your age now.
            </Text>
            {relative?.photoUri ? <RelativePhoto relative={relative} name={MEMBER_NAME[member]} /> : null}
            <View style={styles.photoRow}>
              {relative?.photoUri ? null : <View style={[styles.photo, styles.photoEmpty]} />}
              <Button
                label={relative?.photoUri ? 'Change photo' : 'Add photo'}
                variant="secondary"
                onPress={onAddPhoto}
                style={{ flex: 1 }}
              />
            </View>
            {relative ? (
              <Pressable accessibilityRole="button" onPress={() => onChange(undefined)} style={styles.clear}>
                <Text color="textMuted">Clear answer</Text>
              </Pressable>
            ) : null}
            <Button label="Done" onPress={onClose} style={{ marginTop: spacing.md }} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: { width: 64, height: 64, borderRadius: 32 },
  photoEmpty: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line },
  clear: { alignSelf: 'center', padding: spacing.sm, borderRadius: radius.sm },
});
