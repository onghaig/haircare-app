import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Capture a view as a PNG and hand it to the system share sheet. Throws if sharing isn't possible. */
export async function shareView(ref: RefObject<ComponentRef<typeof View> | null>, title: string): Promise<void> {
  if (!ref.current || !(await Sharing.isAvailableAsync())) throw new Error('unavailable');
  const uri = await captureRef(ref, { format: 'png', quality: 1 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
}

export const SHARE_FAILED = 'Sharing isn’t available right now. Try a screenshot instead.';
