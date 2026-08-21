import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { HostProvider } from './host/use-host'
import { MotionProvider } from './motion'
import './styles/theme.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root')

createRoot(container).render(
  <StrictMode>
    <HostProvider>
      <MotionProvider>
        <App />
      </MotionProvider>
    </HostProvider>
  </StrictMode>
)
