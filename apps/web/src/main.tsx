import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import { RunPage } from './RunPage.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode><RunPage reference="8F42C1" /></StrictMode>,
);
