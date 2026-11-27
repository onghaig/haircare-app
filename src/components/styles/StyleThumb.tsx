import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { stylePhoto } from '@/look/references';
import type { HairStyle } from '@/styles/catalog';
import { styleJob } from '@/styles/jobs';
import { colors, spacing } from '@/theme';
import { useSavedAiImage } from '@/visualize/useAiPreview';

/**
 * The saved AI try-on if there is one, else the bundled example photo, else just the name.
 * Never makes a new image, never draws a face.
 */
export function StyleThumb({ style, stage, id, nameless }: { style: HairStyle; stage: number; id: string; nameless?: boolean }) {
  const uri = useSavedAiImage(styleJob(style.id, stage).name);
  const example = uri ? null : stylePhoto(style.id, stage);
  if (uri) return <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" testID={`${id}-photo`} />;
  if (example != null) return <Image source={example} style={StyleSheet.absoluteFill} contentFit="cover" testID={`${id}-example`} />;
  return (
    <View style={[StyleSheet.absoluteFill, styles.text]} testID={`${id}-text`}>
      {nameless ? null : (
        <Text variant="headline" style={{ textAlign: 'center' }}>
          {style.name}
        </Text>
      )}
      <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
        {style.blurb}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm, gap: 2, backgroundColor: colors.surfaceRaised },
});
