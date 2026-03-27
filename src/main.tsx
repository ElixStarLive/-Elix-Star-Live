import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NativeDialogProvider } from './components/NativeDialog'
import './index.css'

window.addEventListener('error', () => {});

window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'AbortError' || e.reason?.message?.includes('aborted')) {
    e.preventDefault();
    return;
  }
  // Log but don't destroy the UI
  if (import.meta.env.DEV) {
    console.error('[unhandledrejection]', e.reason);
  }
});

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <NativeDialogProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </NativeDialogProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
} catch (e) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding:20px;color:red;font-family:-apple-system,sans-serif;background:#0B0B0F;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"><h2 style="color:#C9A96E">Something went wrong</h2><p style="color:#aaa;margin-top:8px">${e instanceof Error ? e.message : 'Unexpected error'}</p><button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#C9A96E;color:#000;border:none;border-radius:12px;font-weight:bold;cursor:pointer">Reload App</button></div>`;
  }
}
