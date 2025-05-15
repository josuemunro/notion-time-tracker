import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { TimerProvider } from './contexts/TimerContext.jsx' // Import TimerProvider
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <TimerProvider> {/* Wrap App with TimerProvider */}
        <App />
      </TimerProvider>
    </BrowserRouter>
  </React.StrictMode>,
)