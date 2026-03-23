export type Channel = {
  id: string;
  name: string;
  category: string;
  unreadCount?: number;
};

export type Member = {
  id: string;
  name: string;
  avatar: string;
  role: 'admin' | 'member';
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activity?: string;
};

export type Message = {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  timestamp: string;
};

export const channels: Channel[] = [
  { id: 'announcements', name: 'announcements', category: 'Information' },
  { id: 'rules', name: 'rules', category: 'Information' },
  { id: 'general', name: 'general', category: 'Text Channels', unreadCount: 3 },
  { id: 'engineering', name: 'engineering', category: 'Text Channels', unreadCount: 7 },
  { id: 'design', name: 'design', category: 'Text Channels' },
  { id: 'random', name: 'random', category: 'Text Channels', unreadCount: 1 },
  { id: 'standups', name: 'standups', category: 'Team' },
  { id: 'launches', name: 'launches', category: 'Team' },
];

export const members: Member[] = [
  { id: 'sarah', name: 'Sarah Chen', avatar: 'SC', role: 'admin', status: 'online', activity: 'Working on v2 launch' },
  { id: 'marcus', name: 'Marcus Rivera', avatar: 'MR', role: 'admin', status: 'online' },
  { id: 'emma', name: 'Emma Walsh', avatar: 'EW', role: 'member', status: 'online', activity: 'Figma' },
  { id: 'kai', name: 'Kai Tanaka', avatar: 'KT', role: 'member', status: 'online' },
  { id: 'priya', name: 'Priya Sharma', avatar: 'PS', role: 'member', status: 'idle', activity: 'Away' },
  { id: 'alex', name: 'Alex Petrov', avatar: 'AP', role: 'member', status: 'dnd' },
  { id: 'jordan', name: 'Jordan Blake', avatar: 'JB', role: 'member', status: 'offline' },
  { id: 'mia', name: 'Mia Okonkwo', avatar: 'MO', role: 'member', status: 'offline' },
];

const memberColors: Record<string, string> = {
  sarah: '#e78284',
  marcus: '#8caaee',
  emma: '#a6d189',
  kai: '#ef9f76',
  priya: '#ca9ee6',
  alex: '#e5c890',
  jordan: '#85c1dc',
  mia: '#f4b8e4',
};

export function getMemberColor(memberId: string): string {
  return memberColors[memberId] ?? '#dbdee1';
}

export function getMember(id: string): Member | undefined {
  return members.find((m) => m.id === id);
}

export const messages: Message[] = [
  {
    id: '1',
    channelId: 'engineering',
    authorId: 'sarah',
    content: 'Hey team, quick update on the v2 launch timeline. We\'re looking at next Thursday for the public beta.',
    timestamp: '2026-03-23T09:15:00',
  },
  {
    id: '2',
    channelId: 'engineering',
    authorId: 'sarah',
    content: 'The API migration is 95% done. Last remaining piece is the webhook endpoints.',
    timestamp: '2026-03-23T09:15:30',
  },
  {
    id: '3',
    channelId: 'engineering',
    authorId: 'marcus',
    content: 'Nice! I can pick up the webhook migration today. Should be straightforward since we already have the new schema in place.',
    timestamp: '2026-03-23T09:17:00',
  },
  {
    id: '4',
    channelId: 'engineering',
    authorId: 'kai',
    content: 'What about the rate limiter? I noticed the new endpoints don\'t have the sliding window config yet.',
    timestamp: '2026-03-23T09:19:00',
  },
  {
    id: '5',
    channelId: 'engineering',
    authorId: 'sarah',
    content: 'Good catch. Let\'s add that to the pre-launch checklist. @kai can you handle that?',
    timestamp: '2026-03-23T09:20:00',
  },
  {
    id: '6',
    channelId: 'engineering',
    authorId: 'kai',
    content: 'On it. I\'ll have a PR up by EOD.',
    timestamp: '2026-03-23T09:20:30',
  },
  {
    id: '7',
    channelId: 'engineering',
    authorId: 'alex',
    content: 'FYI \u2014 the staging environment is running the latest build. CI is green across the board.',
    timestamp: '2026-03-23T09:25:00',
  },
  {
    id: '8',
    channelId: 'engineering',
    authorId: 'emma',
    content: 'The new onboarding flow is deployed to staging too. Would love some eyes on it before we go live.',
    timestamp: '2026-03-23T09:30:00',
  },
  {
    id: '9',
    channelId: 'engineering',
    authorId: 'marcus',
    content: 'Just looked at it \u2014 the step transitions feel really smooth. One thing: the "skip" button is a bit hard to find on mobile.',
    timestamp: '2026-03-23T09:35:00',
  },
  {
    id: '10',
    channelId: 'engineering',
    authorId: 'emma',
    content: 'Ah good point, I\'ll bump up the contrast. Thanks Marcus!',
    timestamp: '2026-03-23T09:36:00',
  },
  {
    id: '11',
    channelId: 'engineering',
    authorId: 'priya',
    content: 'Load testing results are looking solid \u2014 p99 latency at 180ms under 2x expected peak traffic. I think we\'re good.',
    timestamp: '2026-03-23T09:45:00',
  },
  {
    id: '12',
    channelId: 'engineering',
    authorId: 'sarah',
    content: 'Excellent. Let\'s do a final sync tomorrow at 10am to go through the launch checklist. I\'ll send a cal invite.',
    timestamp: '2026-03-23T09:48:00',
  },
  {
    id: '13',
    channelId: 'general',
    authorId: 'sarah',
    content: 'Reminder: v2 launch party is next Friday at 5pm! We\'re ordering from that Thai place everyone liked.',
    timestamp: '2026-03-23T10:00:00',
  },
  {
    id: '14',
    channelId: 'general',
    authorId: 'emma',
    content: 'Can\'t wait! Should I set up a playlist?',
    timestamp: '2026-03-23T10:05:00',
  },
  {
    id: '15',
    channelId: 'general',
    authorId: 'kai',
    content: 'Yes please! Last time was great.',
    timestamp: '2026-03-23T10:06:00',
  },
  {
    id: '16',
    channelId: 'design',
    authorId: 'emma',
    content: 'Just pushed the final icon set to the design system. 48 new icons, all consistent with the v2 visual language.',
    timestamp: '2026-03-23T08:30:00',
  },
  {
    id: '17',
    channelId: 'random',
    authorId: 'marcus',
    content: 'Has anyone tried that new coffee shop on 5th? The cold brew is unreal.',
    timestamp: '2026-03-23T11:00:00',
  },
];
