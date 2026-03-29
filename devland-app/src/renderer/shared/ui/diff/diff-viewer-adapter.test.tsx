import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { parsePatchDocument } from '@devlandapp/diff-viewer';
import { DiffFileView } from '@devlandapp/diff-viewer/react';

import { installJSDOM } from '@/testing/jsdom';

function createNewFileDiff() {
  return parsePatchDocument(`diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,2 @@
+first line
+second line
`).files[0]!;
}

function getDiffShadowRoot(container: HTMLElement) {
  const diffElement = container.querySelector('diffs-container');
  return diffElement instanceof HTMLElement ? diffElement.shadowRoot : null;
}

let restoreDOM: (() => void) | null = null;

beforeEach(() => {
  restoreDOM = installJSDOM();
});

afterEach(() => {
  cleanup();
  restoreDOM?.();
  restoreDOM = null;
});

describe('DiffFileView', () => {
  it('creates a multi-line comment anchor by dragging the gutter utility', async () => {
    const file = createNewFileDiff();
    const { container, getByPlaceholderText, getByRole, getByText } = render(
      <DiffFileView
        file={file}
        onSubmitComment={async () => {}}
      />,
    );

    await waitFor(() => {
      const shadowRoot = getDiffShadowRoot(container);
      assert.ok(shadowRoot?.querySelector('[data-column-number="1"]'));
      assert.ok(shadowRoot?.querySelector('[data-column-number="2"]'));
    });

    const firstLineNumber = getDiffShadowRoot(container)?.querySelector('[data-column-number="1"]');
    const secondLineNumber = getDiffShadowRoot(container)?.querySelector('[data-column-number="2"]');
    assert.ok(firstLineNumber instanceof HTMLElement);
    assert.ok(secondLineNumber instanceof HTMLElement);

    fireEvent.pointerMove(firstLineNumber);

    await waitFor(() => {
      assert.ok(getDiffShadowRoot(container)?.querySelector('[data-utility-button]'));
    });

    const gutterButton = getDiffShadowRoot(container)?.querySelector('[data-utility-button]');
    assert.ok(gutterButton instanceof HTMLElement);

    fireEvent.pointerDown(gutterButton);
    fireEvent.pointerMove(secondLineNumber);
    fireEvent.pointerUp(secondLineNumber);

    await waitFor(() => {
      assert.ok(getByText('New lines 1-2'));
    });

    assert.ok(getByPlaceholderText('Leave a comment') instanceof HTMLTextAreaElement);
    assert.ok(getByRole('button', { name: 'Comment' }) instanceof HTMLButtonElement);
  });
});
