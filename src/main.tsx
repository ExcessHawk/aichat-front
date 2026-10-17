import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import '@fontsource-variable/newsreader'
import './index.css'

import { ENTRADA, sesion } from './api/client'
import { ChatPage } from './pages/Chat'
import { ConsumoPage } from './pages/Consumo'
import { DemoPage } from './pages/Demo'
import { EntrarPage } from './pages/Entrar'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
})

function Protegida({ children }: { children: React.ReactNode }) {
  // Sin sesión se entra por la demostración. Pedirle la contraseña a quien
  // llegó a mirar es pedirle algo que no tiene.
  if (!sesion.token) return <Navigate to={ENTRADA} replace />
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/entrar" element={<EntrarPage />} />
          <Route path="/crear-cuenta" element={<EntrarPage registro />} />
          <Route
            path="/"
            element={
              <Protegida>
                <ChatPage />
              </Protegida>
            }
          />
          <Route
            path="/c/:id"
            element={
              <Protegida>
                <ChatPage />
              </Protegida>
            }
          />
          <Route
            path="/consumo"
            element={
              <Protegida>
                <ConsumoPage />
              </Protegida>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
