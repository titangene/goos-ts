export default defineNitroPlugin(async () => {
  const config = useRuntimeConfig();
  await initSniperLauncher(config.sniperId);
});
