import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { ArrowUpIcon, HashIcon, PlusIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { dayjs } from '@/lib/dayjs';
import { Route as RootRoute } from '@/routes/__root';
import { useProjectRepoDetailsState } from '@/renderer/projects-shell/use-project-repo';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Avatar, AvatarFallback } from '@/shadcn/components/ui/avatar';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shadcn/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/shadcn/components/ui/field';
import { Input } from '@/shadcn/components/ui/input';
import { Separator } from '@/shadcn/components/ui/separator';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Textarea } from '@/shadcn/components/ui/textarea';
import { cn } from '@/shadcn/lib/utils';

type Channel = Doc<'channels'>;
type Message = Doc<'messages'>;
type ChannelId = Id<'channels'>;

function getAuthorInitial(author: string): string {
  return author.trim().charAt(0).toUpperCase() || '?';
}

function AddChannelDialog({
  open,
  onOpenChange,
  onCreateChannel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateChannel: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);
      await onCreateChannel(name);
      setName('');
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not create that channel.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setName('');
          setError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a channel</DialogTitle>
          <DialogDescription>
            Add a lightweight room for repository-specific discussion.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="channel-name">Channel name</FieldLabel>
              <Input
                aria-invalid={Boolean(error)}
                autoComplete="off"
                id="channel-name"
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="e.g. general, release-notes, triage"
                spellCheck={false}
                value={name}
              />
              <FieldError>{error}</FieldError>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              }
            />
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              Create channel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MessageComposer({
  disabled,
  isSubmitting,
  error,
  value,
  onChange,
  onSubmit,
}: {
  disabled: boolean;
  isSubmitting: boolean;
  error: string | null;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <div className="shrink-0 border-t border-border bg-card/90 px-5 py-4 backdrop-blur">
      <div className="flex flex-col gap-3">
        <Textarea
          disabled={disabled || isSubmitting}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void onSubmit();
            }
          }}
          placeholder="Write to the channel. Cmd/Ctrl + Enter sends."
          rows={4}
          value={value}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Messages stay live through Convex.
          </span>
          <Button
            disabled={disabled || isSubmitting || value.trim() === ''}
            onClick={() => void onSubmit()}
          >
            {isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ArrowUpIcon data-icon="inline-start" />
            )}
            Send
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  return (
    <article className="grid grid-cols-[auto_1fr] gap-3 rounded-3xl border border-border/70 bg-card/85 px-4 py-3 shadow-sm">
      <Avatar className="size-10">
        <AvatarFallback>{getAuthorInitial(message.author)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{message.author}</span>
          <span className="text-xs text-muted-foreground">
            {dayjs(message._creationTime).fromNow()}
          </span>
          {message.editedAt !== null ? (
            <Badge variant="outline">edited</Badge>
          ) : null}
        </div>
        <div className="prose prose-sm max-w-none text-foreground prose-p:my-0 prose-pre:my-0 dark:prose-invert">
          <ReactMarkdown>{message.body}</ReactMarkdown>
        </div>
      </div>
    </article>
  );
}

export function ProjectChannelsView() {
  const { ghUser } = RootRoute.useLoaderData();
  const repoDetails = useProjectRepoDetailsState();
  const createChannel = useMutation(api.channels.create);
  const sendMessage = useMutation(api.messages.send);
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<ChannelId | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);

  const repoSlug =
    repoDetails.status === 'ready' ? repoDetails.data.githubSlug.toLowerCase() : null;
  const channels = useQuery(api.channels.list, repoSlug ? { repoSlug } : 'skip');
  const activeChannel = useMemo(
    () =>
      channels?.find((channel: Channel) => channel._id === selectedChannelId) ??
      channels?.[0] ??
      null,
    [channels, selectedChannelId],
  );

  const messagePage = usePaginatedQuery(
    api.messages.list,
    activeChannel ? { channelId: activeChannel._id } : 'skip',
    { initialNumItems: 30 },
  );
  const chronologicalMessages = useMemo(
    () => [...messagePage.results].reverse(),
    [messagePage.results],
  );

  useEffect(() => {
    if (channels === undefined || channels.length === 0) {
      setSelectedChannelId(null);
      return;
    }

    if (
      selectedChannelId === null ||
      !channels.some((channel: Channel) => channel._id === selectedChannelId)
    ) {
      setSelectedChannelId(channels[0]?._id ?? null);
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    if (!messageViewportRef.current) {
      return;
    }

    messageViewportRef.current.scrollTo({
      top: messageViewportRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [activeChannel?._id, chronologicalMessages.length]);

  const handleCreateChannel = async (name: string) => {
    if (repoSlug === null) {
      throw new Error('Repository metadata is still loading.');
    }

    const channel = await createChannel({
      repoSlug,
      name,
    });

    if (channel !== null) {
      setSelectedChannelId(channel._id);
    }
  };

  const handleSubmitMessage = async () => {
    if (repoSlug === null || activeChannel === null || ghUser === null) {
      return;
    }

    try {
      setIsSending(true);
      setSendError(null);

      const body = draft.trim();

      if (!body) {
        throw new Error('Write something before sending.');
      }

      await sendMessage({
        channelId: activeChannel._id,
        repoSlug,
        body,
        author: ghUser.login,
      });

      setDraft('');
    } catch (submitError) {
      setSendError(
        submitError instanceof Error ? submitError.message : 'Could not send that message.',
      );
    } finally {
      setIsSending(false);
    }
  };

  if (repoDetails.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          Resolving repository details
        </div>
      </div>
    );
  }

  if (repoDetails.status === 'error') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <HashIcon />
          <AlertTitle>Could not open channels</AlertTitle>
          <AlertDescription>{repoDetails.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const repo = repoDetails.data;

  if (repo === null) {
    return null;
  }

  return (
    <>
      <div className="flex h-full min-h-0 bg-card">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar/65">
          <div className="flex flex-col gap-4 border-b border-border px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  Repository chat
                </p>
                <h2 className="display-face text-2xl leading-none text-foreground">
                  {repo.name}
                </h2>
                <p className="text-sm text-muted-foreground">{repo.githubSlug}</p>
              </div>
              <Button onClick={() => setIsAddChannelOpen(true)} size="sm" variant="outline">
                <PlusIcon data-icon="inline-start" />
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Convex live</Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {channels === undefined ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Spinner />
                Loading channels
              </div>
            ) : channels.length === 0 ? (
              <Card size="sm">
                <CardHeader className="gap-3">
                  <CardTitle>No channels yet</CardTitle>
                  <CardDescription>
                    Create the first room for this repository.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={() => setIsAddChannelOpen(true)}>
                    <PlusIcon data-icon="inline-start" />
                    Create first channel
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-1.5">
                {channels.map((channel: Channel) => {
                  const isActive = channel._id === activeChannel?._id;

                  return (
                    <button
                      key={channel._id}
                      className={cn(
                        'flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-primary/12 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      onClick={() => setSelectedChannelId(channel._id)}
                      type="button"
                    >
                      <HashIcon className="size-3.5 shrink-0" />
                      <span className="truncate font-medium">{channel.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-background/35">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <HashIcon className="size-4 text-primary" />
                <h3 className="truncate text-lg font-semibold text-foreground">
                  {activeChannel?.name ?? 'No channel selected'}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Live discussion for {repo.githubSlug}.
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {activeChannel === null ? (
              <div className="flex h-full items-center justify-center px-6">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HashIcon />
                    </EmptyMedia>
                    <EmptyTitle>Create the first channel</EmptyTitle>
                    <EmptyDescription>
                      Channels organize discussion by topic inside this repository.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div
                  ref={messageViewportRef}
                  className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
                >
                  <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                    {messagePage.status !== 'LoadingFirstPage' &&
                    (messagePage.status === 'CanLoadMore' ||
                      messagePage.status === 'LoadingMore') ? (
                      <div className="flex justify-center">
                        <Button
                          disabled={messagePage.status === 'LoadingMore'}
                          onClick={() => messagePage.loadMore(20)}
                          size="sm"
                          variant="outline"
                        >
                          {messagePage.status === 'LoadingMore' ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          Load earlier messages
                        </Button>
                      </div>
                    ) : null}

                    {messagePage.status === 'LoadingFirstPage' ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <Spinner />
                          Loading messages
                        </div>
                      </div>
                    ) : chronologicalMessages.length === 0 ? (
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <HashIcon />
                          </EmptyMedia>
                          <EmptyTitle>Start the conversation</EmptyTitle>
                          <EmptyDescription>
                            This channel is empty. The first message sets the tone.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      chronologicalMessages.map((message, index) => (
                        <div key={message._id} className="flex flex-col gap-4">
                          {index > 0 ? <Separator /> : null}
                          <ChatMessage message={message} />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <MessageComposer
                  disabled={activeChannel === null}
                  error={sendError}
                  isSubmitting={isSending}
                  onChange={setDraft}
                  onSubmit={handleSubmitMessage}
                  value={draft}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      <AddChannelDialog
        open={isAddChannelOpen}
        onCreateChannel={handleCreateChannel}
        onOpenChange={setIsAddChannelOpen}
      />
    </>
  );
}
