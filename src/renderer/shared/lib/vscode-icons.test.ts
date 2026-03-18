import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getVscodeIconUrlForEntry } from '@/renderer/shared/lib/vscode-icons';

describe('getVscodeIconUrlForEntry', () => {
  it('uses exact filename matches from the vscode-icons manifest', () => {
    assert.match(getVscodeIconUrlForEntry('go.mod', 'file', 'dark'), /\/file_type_go_package\.svg$/);
    assert.match(getVscodeIconUrlForEntry('go.sum', 'file', 'dark'), /\/file_type_go_package\.svg$/);
  });

  it('uses language fallbacks for regular file extensions', () => {
    assert.match(getVscodeIconUrlForEntry('internal/env_test.go', 'file', 'dark'), /\/file_type_go\.svg$/);
    assert.match(getVscodeIconUrlForEntry('src/chat-composer.tsx', 'file', 'dark'), /\/file_type_reactts\.svg$/);
  });

  it('falls back to generic defaults when there is no better match', () => {
    assert.match(getVscodeIconUrlForEntry('foo.unknown-ext', 'file', 'dark'), /\/default_file\.svg$/);
    assert.match(getVscodeIconUrlForEntry('totally-unknown-folder', 'directory', 'dark'), /\/default_folder\.svg$/);
  });
});
