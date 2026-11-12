import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from '@/store';
import { AuthGate } from '@/features/auth/AuthGate';
import { applyTheme } from '@/lib/theme';
import { ModalProvider } from '@/components/ui/Modal';
import { Toaster } from '@/components/ui/Toaster';
import App from './App';
import './styles/index.css';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ModalProvider>
          <AuthGate>
            <App />
          </AuthGate>
          <Toaster />
        </ModalProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
