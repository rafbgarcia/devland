import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const normalizeChannelName = (value: string): string =>
  value.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();

export const list = query({
  args: {
    repoSlug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('channels')
      .withIndex('by_repoSlug_position', (q) => q.eq('repoSlug', args.repoSlug))
      .collect();
  },
});

export const create = mutation({
  args: {
    repoSlug: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeChannelName(args.name);

    if (!name) {
      throw new Error('Channel name is required.');
    }

    const existingChannels = await ctx.db
      .query('channels')
      .withIndex('by_repoSlug_position', (q) => q.eq('repoSlug', args.repoSlug))
      .collect();

    if (existingChannels.some((channel) => channel.name === name)) {
      throw new Error('A channel with that name already exists.');
    }

    const position = existingChannels.at(-1)?.position ?? -1;
    const channelId = await ctx.db.insert('channels', {
      repoSlug: args.repoSlug,
      name,
      position: position + 1,
    });

    return await ctx.db.get(channelId);
  },
});
