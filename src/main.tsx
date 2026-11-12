import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './lib/auth.tsx';
import { PermissionsProvider } from './lib/permissions.tsx';
import { ToastProvider } from './kit.tsx';
import { TwoFactorGate } from './pages/Account.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';
import { registerServiceWorker, watchForNewVersion } from './lib/pwa.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <PermissionsProvider>
            <ToastProvider>
              <App />
              <TwoFactorGate />
            </ToastProvider>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
watchForNewVersion();
