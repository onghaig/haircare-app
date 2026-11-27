import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { PANO_H, PANO_W, renderHeadPanoramaImage } from '@/scan/scalpRender';
import type { ScanRecord } from '@/scan/session';
import { colors, radius, spacing } from '@/theme';

/**
 * The whole head unrolled like a phone panorama, from the five photos and the panorama frames.
 * Dark gaps are parts of the head no photo saw. The back is at both edges, the face in the middle.
 */
export function HeadPanorama({ scan, width }: { scan: ScanRecord; width: number }) {
  const [image, setImage] = useState<{ id: string; uri: string; seen: number } | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    renderHeadPanoramaImage(scan)
      .then((r) => live && setImage(r ? { id: scan.id, ...r } : null))
      .catch(() => live && setImage(null));
    return () => {
      live = false;
    };
  }, [scan]);
  const height = (width * PANO_H) / PANO_W;
  const current = image && image.id === scan.id ? image : image === null ? null : undefined;
  return (
    <View style={{ gap: spacing.sm, alignItems: 'center' }} testID="head-panorama">
      <View style={[styles.frame, { width, height }]}>
        {current ? (
          <Image
            source={{ uri: current.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            transition={200}
            testID="head-panorama-image"
          />
        ) : current === undefined ? (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <ActivityIndicator color={colors.accent} />
            <Text variant="caption" color="textMuted">
              Putting your photos together…
            </Text>
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Text variant="caption" color="textMuted">
              No photo of this scan could be placed on the head.
            </Text>
          </View>
        )}
      </View>
      <View style={[styles.labels, { width }]}>
        {['Back', 'Right side', 'Front', 'Left side', 'Back'].map((l, i) => (
          <Text key={i} variant="caption" color="textMuted">
            {l}
          </Text>
        ))}
      </View>
      {current ? (
        <Text variant="caption" color="textMuted" testID="head-panorama-seen">
          {`About ${Math.round(current.seen * 100)}% of your head is in the photos. Dark gaps are parts no photo saw.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
});
