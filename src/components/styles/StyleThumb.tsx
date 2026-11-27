import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import type { HairStyle } from '@/styles/catalog';
import { styleJob } from '@/styles/jobs';
import { useSavedAiImage } from '@/visualize/useAiPreview';

import { StyleSketch } from './StyleSketch';

/** The saved AI try-on if there is one, otherwise the sketch. Never makes a new image. */
export function StyleThumb({ style, stage, id }: { style: HairStyle; stage: number; id: string }) {
  const uri = useSavedAiImage(styleJob(style.id, stage).name);
  if (uri) return <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" testID={`${id}-photo`} />;
  return <StyleSketch id={id} shape={style.sketch} stage={stage} />;
}
