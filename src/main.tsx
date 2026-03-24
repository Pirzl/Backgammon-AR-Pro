import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// IMPORTANTE: importar el nuevo provider
import { MediaPipeProvider } from './features/hand-tracking/lib/MediaPipeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MediaPipeProvider>
      <App />
    </MediaPipeProvider>
  </StrictMode>,
)
