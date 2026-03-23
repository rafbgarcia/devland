import { useState } from 'react';

import { ChannelSidebar } from '@/components/channel-sidebar';
import { MessageFeed } from '@/components/message-feed';
import { MemberList } from '@/components/member-list';

export function App() {
  const [activeChannelId, setActiveChannelId] = useState('engineering');

  return (
    <div className="flex h-screen overflow-hidden">
      <ChannelSidebar
        activeChannelId={activeChannelId}
        onChannelSelect={setActiveChannelId}
      />
      <MessageFeed activeChannelId={activeChannelId} />
      <MemberList />
    </div>
  );
}
