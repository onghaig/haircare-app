import { requireNativeViewManager } from 'expo-modules-core';
import { forwardRef, type ComponentType, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { HeadMapCameraViewProps, HeadMapCameraViewRef } from './HeadMap.types';
import { isHeadMapAvailable } from './HeadMapModule';

type NativeProps = HeadMapCameraViewProps & { ref?: Ref<HeadMapCameraViewRef> };

const NativeView: ComponentType<NativeProps> | null = isHeadMapAvailable
  ? requireNativeViewManager<NativeProps>('HeadMap')
  : null;

/**
 * Live guided-scan camera. Analysis runs natively; this component only receives
 * quality reports (~8 a second), the aligned moment and the captured photo.
 */
export const HeadMapCameraView = forwardRef<HeadMapCameraViewRef, HeadMapCameraViewProps>(function HeadMapCameraView(
  props,
  ref,
) {
  if (!NativeView) {
    return (
      <View style={[styles.fallback, props.style]} accessibilityRole="alert">
        <Text style={styles.text}>The scan camera needs a development build of the app.</Text>
      </View>
    );
  }
  return <NativeView {...props} ref={ref} />;
});

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { color: '#93A19C', fontSize: 15, textAlign: 'center' },
});
