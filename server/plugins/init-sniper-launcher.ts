export default defineNitroPlugin(async nitroApp => {
  const config = useRuntimeConfig();
  const auctionHouse = await initSniperLauncher(config.sniperId);

  nitroApp.hooks.hook('close', async () => {
    await auctionHouse.disconnect();
  });
});
