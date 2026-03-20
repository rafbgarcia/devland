import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { LayerToggle } from './layer-toggle';

describe('LayerToggle', () => {
  it('renders the codex menu trigger outside the codex pane button', () => {
    const markup = renderToStaticMarkup(
      <LayerToggle
        activePaneId="codex"
        onChangePane={() => {}}
        codexMenu={(
          <button type="button" aria-label="Codex menu">
            Menu
          </button>
        )}
      />,
    );

    const tabLabelIndex = markup.indexOf('>Codex<');
    const menuButtonIndex = markup.indexOf('aria-label="Codex menu"');

    assert.notEqual(tabLabelIndex, -1);
    assert.notEqual(menuButtonIndex, -1);

    const markupBeforeMenuButton = markup.slice(tabLabelIndex, menuButtonIndex);
    assert.match(markupBeforeMenuButton, /<\/button>/);
  });
});
