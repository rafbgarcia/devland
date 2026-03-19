import { useEffect, useState } from 'react';

import { createDevlandClient, type DevlandHostContext } from '@devlandapp/sdk';

type PullRequestAuthor = {
  login?: string | null;
};

type PullRequestItem = {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  author?: PullRequestAuthor | null;
  url: string;
  updatedAt: string;
  headRefName: string;
  baseRefName: string;
};

const devland = createDevlandClient();

const formatDate = (value: string): string => {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
};

export function App() {
  const [repo, setRepo] = useState<DevlandHostContext['repo'] | null>(null);
  const [pullRequests, setPullRequests] = useState<PullRequestItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPullRequests = async (refresh: boolean) => {
    try {
      setStatus((current) => (current === 'ready' ? 'ready' : 'loading'));
      setErrorMessage(null);
      setIsRefreshing(refresh);

      const context = await devland.getContext();
      setRepo(context.repo);

      const commandResult = await devland.runCommand({
        command: 'gh',
        args: [
          'pr',
          'list',
          '--repo',
          context.repo.githubSlug,
          '--limit',
          '50',
          '--json',
          'number,title,state,isDraft,author,url,updatedAt,headRefName,baseRefName',
        ],
      });

      if (commandResult.exitCode !== 0) {
        throw new Error(commandResult.stderr.trim() || `gh exited with code ${commandResult.exitCode}`);
      }

      setPullRequests(JSON.parse(commandResult.stdout || '[]') as PullRequestItem[]);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not load pull requests.',
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPullRequests(false);
  }, []);

  const subtitle = status === 'loading' || repo === null
    ? 'Resolving repository context from Devland.'
    : `Listing pull requests for ${repo.githubSlug} through the GitHub CLI.`;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Extension</p>
          <h1 className="title">Pull Requests</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
        <button
          className="refresh"
          disabled={isRefreshing}
          onClick={() => {
            void loadPullRequests(true);
          }}
          type="button"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      {status === 'loading' ? (
        <div className="notice">Loading pull requests with gh...</div>
      ) : status === 'error' ? (
        <div className="notice error">{errorMessage ?? 'Could not load pull requests.'}</div>
      ) : pullRequests.length === 0 ? (
        <div className="notice empty">No open pull requests were returned by gh.</div>
      ) : (
        <div className="list">
          {pullRequests.map((pullRequest) => (
            <a
              key={pullRequest.number}
              className="card"
              href={pullRequest.url}
              rel="noreferrer"
              target="_blank"
            >
              <div className="card-main">
                <p className="card-title">
                  #{pullRequest.number} {pullRequest.title}
                </p>
                <div className="card-meta">
                  <span className={pullRequest.state === 'OPEN' ? 'badge open' : 'badge'}>
                    {pullRequest.state}
                  </span>
                  {pullRequest.isDraft ? <span className="badge draft">Draft</span> : null}
                  <span>@{pullRequest.author?.login ?? 'unknown'}</span>
                  <span>
                    {pullRequest.headRefName} -&gt; {pullRequest.baseRefName}
                  </span>
                  <span>Updated {formatDate(pullRequest.updatedAt)}</span>
                </div>
              </div>
              <span className="arrow">↗</span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
