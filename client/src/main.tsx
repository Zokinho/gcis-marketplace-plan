import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './lib/useTheme';
import { AuthProvider } from './lib/AuthContext';
import { initSentry } from './lib/sentry';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
