/**
 * Entrada de la demostración.
 *
 * `/demo?rol=usuario` pide una sesión al backend y aterriza. Sin registro y sin
 * contraseña: es lo que embebe el portafolio en un iframe.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, sesion, type SesionUsuario } from '../api/client'

const ROLES = ['usuario', 'administrador'] as const
type Rol = (typeof ROLES)[number]

const ATERRIZA: Record<Rol, string> = {
  usuario: '/',
  administrador: '/consumo',
}

export function DemoPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const crudo = params.get('rol')
  const rol: Rol = (ROLES as readonly string[]).includes(crudo ?? '') ? (crudo as Rol) : 'usuario'

  useEffect(() => {
    let vigente = true
    api
      .post<{ token: string; refreshToken: string; user: SesionUsuario }>('/api/demo/session', {
        role: rol,
      })
      .then((datos) => {
        if (!vigente) return
        sesion.guardar(datos)
        // `replace` y no `navigate`: así el botón de atrás no vuelve a pedir
        // otra sesión.
        window.location.replace(ATERRIZA[rol])
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo abrir la demostración')
      })
    return () => {
      vigente = false
    }
  }, [rol])

  return (
    <div className="centrado">
      {error ? (
        <>
          <h1>No se pudo entrar</h1>
          <p className="nota">{error}</p>
          <button type="button" onClick={() => navigate('/entrar')}>
            Entrar con una cuenta
          </button>
        </>
      ) : (
        <p>Entrando como {rol}…</p>
      )}
    </div>
  )
}
