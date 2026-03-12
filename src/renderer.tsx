import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Renderer root element not found.');
}

createRoot(app).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
