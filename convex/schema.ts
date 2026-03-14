import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  channels: defineTable({
    repoSlug: v.string(),
    name: v.string(),
    position: v.number(),
  }).index('by_repoSlug_position', ['repoSlug', 'position']),

  messages: defineTable({
    channelId: v.id('channels'),
    repoSlug: v.string(),
    body: v.string(),
    author: v.string(),
    editedAt: v.union(v.number(), v.null()),
  }).index('by_channelId', ['channelId']),
});
