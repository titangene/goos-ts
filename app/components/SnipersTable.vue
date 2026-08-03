<script setup lang="ts">
import { Column } from '#shared/Column.ts';
import type { SnapshotsMessage, SniperSnapshotData } from '#shared/types.ts';

const { data: initialSnapshots } = await useFetch<SniperSnapshotData[]>('/api/snipers');

const snapshots = ref<SniperSnapshotData[]>(initialSnapshots.value ?? []);

function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener('message', (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as SnapshotsMessage;
    if (message.type === 'snapshots') {
      snapshots.value = message.snapshots;
    }
  });
}

onMounted(connect);
</script>

<template>
  <table>
    <thead>
      <tr>
        <th v-for="column in Column.values" :key="column.name">{{ column.name }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="snapshot in snapshots" :id="`auction-${snapshot.itemId}`" :key="snapshot.itemId">
        <td v-for="column in Column.values" :key="column.className" :class="column.className">
          {{ column.valueIn(snapshot) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style lang="css" scoped>
table {
  border-collapse: collapse;
}
th,
td {
  border: 1px solid #000;
  padding: 2px 6px;
}
</style>
