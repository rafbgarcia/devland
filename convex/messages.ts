import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

export const list = query({
  args: {
    channelId: v.id('channels'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('messages')
      .withIndex('by_channelId', (q) => q.eq('channelId', args.channelId))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const send = mutation({
  args: {
    channelId: v.id('channels'),
    repoSlug: v.string(),
    body: v.string(),
    author: v.string(),
  },
  handler: async (ctx, args) => {
    const body = args.body.trim();
    const author = args.author.trim();

    if (!body) {
      throw new Error('Message body is required.');
    }

    if (!author) {
      throw new Error('Author is required.');
    }

    const channel = await ctx.db.get(args.channelId);

    if (channel === null || channel.repoSlug !== args.repoSlug) {
      throw new Error('Channel was not found for this repository.');
    }

    const messageId = await ctx.db.insert('messages', {
      channelId: args.channelId,
      repoSlug: args.repoSlug,
      body,
      author,
      editedAt: null,
    });

    return {
      messageId,
      channelId: args.channelId,
    };
  },
});
