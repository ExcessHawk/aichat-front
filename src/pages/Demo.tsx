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

/** El rol que corresponde a una cuenta ya guardada. */
function rolDeSesion(): Rol | null {
  const user = sesion.user
  if (!user) return null
  return user.role === 'admin' ? 'administrador' : 'usuario'
}

export function DemoPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const crudo = params.get('rol')
  const rol: Rol = (ROLES as readonly string[]).includes(crudo ?? '') ? (crudo as Rol) : 'usuario'

  useEffect(() => {
    let vigente = true

    const entrar = async (intento = 0): Promise<void> => {
      // Si ya hay sesión de este mismo rol, no se pide otra. Cada visita a
      // /demo gastaba una, y entre el iframe del portafolio y un par de
      // recargas se agota el límite por minuto: el visitante ve "no se pudo
      // entrar" sin que nada esté roto.
      if (sesion.token && rolDeSesion() === rol) {
        window.location.replace(ATERRIZA[rol])
        return
      }

      try {
        const datos = await api.post<{
          token: string
          refreshToken: string
          user: SesionUsuario
        }>('/api/demo/session', { role: rol })
        if (!vigente) return
        sesion.guardar(datos)
        // `replace` y no `navigate`: así el botón de atrás no vuelve a pedir
        // otra sesión.
        window.location.replace(ATERRIZA[rol])
      } catch (e) {
        if (!vigente) return
        const status = (e as { status?: number } | null)?.status
        // Demasiadas sesiones en un minuto no es un error del visitante: se
        // espera y se vuelve a intentar una vez, diciendo qué está pasando.
        if (status === 429 && intento === 0) {
          setError('Hay mucha gente entrando a la vez. Reintento en unos segundos…')
          await new Promise((r) => setTimeout(r, 6000))
          if (!vigente) return
          setError(null)
          return entrar(1)
        }
        setError(e instanceof Error ? e.message : 'No se pudo abrir la demostración')
      }
    }

    void entrar()
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
          <button type="button" onClick={() => window.location.reload()}>
            Volver a intentar
          </button>
          <p className="nota">
            <button type="button" className="como-enlace" onClick={() => navigate('/entrar')}>
              o entrar con una cuenta
            </button>
          </p>
        </>
      ) : (
        <p>Entrando como {rol}…</p>
      )}
    </div>
  )
}
