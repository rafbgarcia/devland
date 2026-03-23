import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Input } from 'electron';

import {
  APP_SHORTCUT_ACCELERATORS,
  createAppShortcutCommandDispatcher,
  getAppShortcutCommand,
  registerGlobalAppShortcutBindings,
} from '@/main-process/app-shortcuts';

function createInput(overrides: Partial<Input>): Input {
  return {
    type: 'keyDown',
    key: '',
    code: '',
    isAutoRepeat: false,
    shift: false,
    control: false,
    alt: false,
    meta: false,
    location: 0,
    isSystemKey: false,
    isComposing: false,
    ...overrides,
  } as Input;
}

describe('getAppShortcutCommand', () => {
  it('maps cmd+shift+brackets to code target cycling', () => {
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, shift: true, code: 'BracketLeft' })),
      {
        type: 'cycle-code-target-tab',
        direction: 'previous',
      },
    );
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, shift: true, code: 'BracketRight' })),
      {
        type: 'cycle-code-target-tab',
        direction: 'next',
      },
    );
  });

  it('maps cmd+brackets to pane cycling', () => {
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, code: 'BracketLeft' })),
      {
        type: 'cycle-code-pane',
        direction: 'previous',
      },
    );
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, code: 'BracketRight' })),
      {
        type: 'cycle-code-pane',
        direction: 'next',
      },
    );
  });

  it('maps cmd+t and cmd+w to session creation and closing', () => {
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, code: 'KeyT' })),
      {
        type: 'create-code-session',
      },
    );
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, code: 'KeyW' })),
      {
        type: 'close-current-tab',
      },
    );
  });

  it('maps cmd+/ to shortcut overlay toggling', () => {
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, code: 'Slash' })),
      {
        type: 'toggle-shortcut-hints',
      },
    );
  });

  it('keeps project slot shortcuts on cmd+digits', () => {
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, code: 'Digit2' })),
      {
        type: 'activate-project-tab-by-shortcut-slot',
        slot: 2,
      },
    );
    assert.deepEqual(
      getAppShortcutCommand(createInput({ meta: true, code: 'Digit9' })),
      {
        type: 'activate-project-tab-by-shortcut-slot',
        slot: 9,
      },
    );
  });
});

describe('createAppShortcutCommandDispatcher', () => {
  it('deduplicates identical commands dispatched in the same event burst', () => {
    const receivedCommands: string[] = [];
    const dispatch = createAppShortcutCommandDispatcher((command) => {
      receivedCommands.push(JSON.stringify(command));
    });

    dispatch({
      type: 'cycle-code-pane',
      direction: 'next',
    });
    dispatch({
      type: 'cycle-code-pane',
      direction: 'next',
    });
    dispatch({
      type: 'cycle-code-pane',
      direction: 'previous',
    });

    assert.deepEqual(receivedCommands, [
      JSON.stringify({
        type: 'cycle-code-pane',
        direction: 'next',
      }),
      JSON.stringify({
        type: 'cycle-code-pane',
        direction: 'previous',
      }),
    ]);
  });
});

describe('registerGlobalAppShortcutBindings', () => {
  it('registers the expected accelerator set and can clean it up', () => {
    const registeredAccelerators: string[] = [];
    const unregisteredAccelerators: string[] = [];
    const firedCommands: string[] = [];
    const callbacksByAccelerator = new Map<string, () => void>();

    const unregister = registerGlobalAppShortcutBindings(
      {
        register: (accelerator, callback) => {
          registeredAccelerators.push(accelerator);
          callbacksByAccelerator.set(accelerator, callback);
          return true;
        },
        unregister: (accelerator) => {
          unregisteredAccelerators.push(accelerator);
        },
      },
      (command) => {
        firedCommands.push(JSON.stringify(command));
      },
    );

    assert.deepEqual(
      registeredAccelerators,
      APP_SHORTCUT_ACCELERATORS.map((binding) => binding.accelerator),
    );

    callbacksByAccelerator.get('CommandOrControl+]')?.();
    callbacksByAccelerator.get('CommandOrControl+3')?.();

    assert.deepEqual(firedCommands, [
      JSON.stringify({
        type: 'cycle-code-pane',
        direction: 'next',
      }),
      JSON.stringify({
        type: 'activate-project-tab-by-shortcut-slot',
        slot: 3,
      }),
    ]);

    unregister();

    assert.deepEqual(
      unregisteredAccelerators,
      APP_SHORTCUT_ACCELERATORS.map((binding) => binding.accelerator),
    );
  });
});
