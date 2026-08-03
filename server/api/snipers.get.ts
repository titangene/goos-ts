import type { SniperSnapshotData } from '../../shared/types.ts';

export default defineEventHandler((): SniperSnapshotData[] => {
  return getSnapshots();
});
