import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/noto-sans-tc/400.css';
import '@fontsource/noto-sans-tc/500.css';
import '@fontsource/noto-sans-tc/600.css';
import './styles/tokens.css';
import './styles/global.css';
import { AppRouter } from './app/AppRouter';
import { createServiceRegistry } from './services/createServiceRegistry';
import { ServiceRegistryProvider } from './services/ServiceRegistryContext';

const registry = createServiceRegistry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServiceRegistryProvider registry={registry}>
      <AppRouter />
    </ServiceRegistryProvider>
  </StrictMode>,
);
