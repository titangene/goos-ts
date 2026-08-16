<script setup lang="ts">
const itemId = ref('');
const stopPrice = ref<number | null>(null);

async function joinAuction(): Promise<void> {
  if (!itemId.value || stopPrice.value === null) {
    return;
  }

  await $fetch('/api/join', {
    method: 'POST',
    body: { itemId: itemId.value, stopPrice: stopPrice.value }
  });
  itemId.value = '';
  stopPrice.value = null;
}
</script>

<template>
  <div>
    <form @submit.prevent="joinAuction">
      <input
        id="new-item-id"
        v-model="itemId"
        type="text"
        name="new-item-id"
        aria-label="Item Id"
      />
      <input
        id="new-item-stop-price"
        v-model.number="stopPrice"
        type="number"
        name="new-item-stop-price"
        aria-label="Stop Price"
      />
      <button id="join-button" type="submit">Join</button>
    </form>
    <SnipersTable />
  </div>
</template>

<style lang="css" scoped>
form {
  margin-bottom: 16px;
  display: flex;
  gap: 10px;
}
</style>
