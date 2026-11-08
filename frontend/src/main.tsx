import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ConfigError, getConfig } from './config'
import { App, ConfigErrorScreen } from './ui/App'
import './ui/app.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('index.html is missing the #root element')

function renderApp() {
  try {
    return <App config={getConfig()} />
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message)
      return <ConfigErrorScreen message={error.message} />
    }
    throw error
  }
}

createRoot(rootElement).render(<StrictMode>{renderApp()}</StrictMode>)
