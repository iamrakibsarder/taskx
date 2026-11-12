import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { bootstrap, store } from '@/store';
import { ModalProvider } from '@/components/ui/Modal';
import { Toaster } from '@/components/ui/Toaster';
import App from './App';
import './styles/index.css';

void bootstrap();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ModalProvider>
          <App />
          <Toaster />
        </ModalProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
