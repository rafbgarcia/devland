import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { installElectronApiBridge } from './lib/devland.js';
import '@/styles/global.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Missing extension root element.');
}

installElectronApiBridge();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
