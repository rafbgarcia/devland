import { useState } from 'react';

import { CodeDiffViewer } from '@/renderer/components/code-diff-viewer';
import { CodeSidebar } from '@/renderer/components/code-sidebar';
import { useGitBranches, useGitFileDiff, useGitStatus } from '@/renderer/hooks/use-git';

export function CodeWorkspaceView({ repoPath }: { repoPath: string }) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const branchesState = useGitBranches(repoPath);
  const statusState = useGitStatus(repoPath);
  const diffState = useGitFileDiff(repoPath, selectedFilePath);

  const handleBranchChange = async (branchName: string) => {
    try {
      await window.electronAPI.checkoutGitBranch(repoPath, branchName);
      setSelectedFilePath(null);
      await Promise.all([branchesState.refetch(), statusState.refetch()]);
    } catch (error) {
      console.error('Failed to checkout branch:', error);
    }
  };

  return (
    <div className="flex h-full">
      <CodeSidebar
        branches={branchesState.data ?? []}
        isBranchesLoading={branchesState.status === 'loading'}
        files={statusState.data?.files ?? []}
        isStatusLoading={statusState.status === 'loading'}
        selectedFilePath={selectedFilePath}
        onBranchChange={handleBranchChange}
        onSelectFile={setSelectedFilePath}
      />
      <CodeDiffViewer
        filePath={selectedFilePath}
        diff={diffState.status === 'ready' ? diffState.data : null}
        isLoading={diffState.status === 'loading' && selectedFilePath !== null}
      />
    </div>
  );
}
