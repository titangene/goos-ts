<script setup lang="ts">
import type { SnapshotsMessage, SnipersTableColumn, SniperRow } from '@shared/types.ts';

const { data: initialData } = await useFetch<{ columns: SnipersTableColumn[]; rows: SniperRow[] }>(
  '/api/snipers'
);

const columns = ref<SnipersTableColumn[]>(initialData.value?.columns ?? []);
const rows = ref<SniperRow[]>(initialData.value?.rows ?? []);

function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener('message', (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as SnapshotsMessage;
    if (message.type === 'snapshots') {
      columns.value = message.columns;
      rows.value = message.rows;
    }
  });
}

onMounted(connect);
</script>

<template>
  <table>
    <thead>
      <tr>
        <th v-for="column in columns" :key="column.name">{{ column.name }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :id="`auction-${row.itemId}`" :key="row.itemId">
        <td v-for="(column, index) in columns" :key="column.key" :data-testid="column.key">
          {{ row.values[index] }}
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
