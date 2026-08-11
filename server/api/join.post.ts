interface JoinRequestBody {
  itemId?: string;
  stopPrice?: number;
}

export default defineEventHandler(async event => {
  const body = await readBody<JoinRequestBody>(event);

  if (!body?.itemId) {
    throw createError({ statusCode: 400, statusMessage: 'itemId is required' });
  }

  if (typeof body.stopPrice !== 'number' || Number.isNaN(body.stopPrice)) {
    throw createError({ statusCode: 400, statusMessage: 'stopPrice is required' });
  }

  joinAuction(body.itemId, body.stopPrice);

  return { ok: true };
});
