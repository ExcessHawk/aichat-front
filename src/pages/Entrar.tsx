import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, sesion, type SesionUsuario } from '../api/client'

type Respuesta = { token: string; refreshToken: string; user: SesionUsuario }

export function EntrarPage({ registro = false }: { registro?: boolean }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const datos = registro
        ? await api.post<Respuesta>('/api/auth/register', { email, password, fullName })
        : await api.post<Respuesta>('/api/auth/login', { email, password })
      sesion.guardar(datos)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo entrar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="centrado">
      <form onSubmit={enviar} className="formulario">
        <h1>{registro ? 'Crear cuenta' : 'Entrar'}</h1>

        {registro && (
          <label>
            Nombre
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
        )}

        <label>
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={registro ? 12 : 1}
            autoComplete={registro ? 'new-password' : 'current-password'}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={enviando}>
          {enviando ? 'Un momento…' : registro ? 'Crear cuenta' : 'Entrar'}
        </button>

        <p className="nota">
          {registro ? (
            <>
              ¿Ya tienes cuenta? <Link to="/entrar">Entrar</Link>
            </>
          ) : (
            <>
              ¿Sin cuenta? <Link to="/crear-cuenta">Crear una</Link> o{' '}
              <Link to="/demo?rol=usuario">mirar la demostración</Link>
            </>
          )}
        </p>
      </form>
    </div>
  )
}
