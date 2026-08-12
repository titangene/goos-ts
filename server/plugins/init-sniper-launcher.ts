export default defineNitroPlugin(async nitroApp => {
  const config = useRuntimeConfig();

  await main(config.sniperId, handler => {
    nitroApp.hooks.hook('close', handler);
  });
});
