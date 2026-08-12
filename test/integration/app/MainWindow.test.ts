import { describe, expect, it } from 'vitest';
import { readBody } from 'h3';
import { flushPromises } from '@vue/test-utils';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import IndexPage from '@app/pages/index.vue';

registerEndpoint('/api/snipers', () => ({ columns: [], rows: [] }));

describe('the main window', () => {
  it('makes a user request when join button is clicked', async () => {
    let receivedBody: { itemId?: string; stopPrice?: number } | undefined;
    registerEndpoint('/api/join', {
      method: 'POST',
      handler: async event => {
        receivedBody = await readBody(event);
        return { ok: true };
      }
    });

    const wrapper = await mountSuspended(IndexPage);

    await wrapper.find('#new-item-id').setValue('an item-id');
    await wrapper.find('#new-item-stop-price').setValue('789');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(receivedBody).toEqual({ itemId: 'an item-id', stopPrice: 789 });
  });
});
