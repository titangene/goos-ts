<script setup lang="ts">
useHead({ title: 'Auction Sniper' });

const route = useRoute();
const requestUrl = useRequestURL();
const wsProtocol = requestUrl.protocol === 'https:' ? 'wss:' : 'ws:';

useWebSocket(`${wsProtocol}//${requestUrl.host}/auction-sniper?itemId=${route.query.itemId}`);
</script>

<template>
  <div data-testid="sniper-status">Joining</div>
</template>
