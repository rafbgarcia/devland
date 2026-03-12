import { contextBridge } from 'electron';

import { electronApi } from './preload/bridge';

contextBridge.exposeInMainWorld('electronAPI', electronApi);
