import { useScans } from '@/scan/ScanProvider';

import { ownPhoto, type OwnPhoto } from './ownPhoto';

export function useOwnPhoto(): OwnPhoto | null {
  return ownPhoto(useScans().records);
}
