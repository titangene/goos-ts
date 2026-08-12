import type { Peer } from 'crossws';

import type { SnapshotsMessage } from '@shared/types.ts';

const peers = new Set<Peer>();

function snapshotsPayload(): string {
  const { columns, rows } = getTableData();
  const message: SnapshotsMessage = { type: 'snapshots', columns, rows };
  return JSON.stringify(message);
}

onSnapshotsChanged(() => {
  const payload = snapshotsPayload();
  peers.forEach(peer => peer.send(payload));
});

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer);
    peer.send(snapshotsPayload());
  },
  close(peer) {
    peers.delete(peer);
  }
});
