/**
 * Cliente de la API.
 *
 * El token vive en localStorage y se adjunta a cada petición. Un 401 limpia la
 * sesión y manda a la entrada, una sola vez.
 */
const TOKEN_KEY = 'chat.token'
const REFRESH_KEY = 'chat.refresh'
const USER_KEY = 'chat.user'

export interface SesionUsuario {
  id: number
  email: string
  fullName: string
  role: 'user' | 'admin'
}

export const sesion = {
  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  get user(): SesionUsuario | null {
    try {
      const crudo = localStorage.getItem(USER_KEY)
      return crudo ? (JSON.parse(crudo) as SesionUsuario) : null
    } catch {
      return null
    }
  },
  guardar(datos: { token: string; refreshToken: string; user: SesionUsuario }) {
    try {
      localStorage.setItem(TOKEN_KEY, datos.token)
      localStorage.setItem(REFRESH_KEY, datos.refreshToken)
      localStorage.setItem(USER_KEY, JSON.stringify(datos.user))
    } catch {
      /* navegador sin almacenamiento: la sesión dura lo que la pestaña */
    }
  },
  limpiar() {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      localStorage.removeItem(USER_KEY)
    } catch {
      /* nada que limpiar */
    }
  },
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

function cabeceras(conCuerpo: boolean): Record<string, string> {
  const h: Record<string, string> = {}
  const token = sesion.token
  if (token) h.Authorization = `Bearer ${token}`
  if (conCuerpo) h['Content-Type'] = 'application/json'
  return h
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: cabeceras(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    sesion.limpiar()
    if (!location.pathname.startsWith('/entrar')) location.href = '/entrar'
    throw new ApiError(401, 'La sesión terminó')
  }

  const texto = await res.text()
  const datos = texto ? JSON.parse(texto) : null

  if (!res.ok) {
    const mensaje =
      (datos && (datos.error || datos.detail || datos.message)) || `Error ${res.status}`
    throw new ApiError(res.status, mensaje)
  }
  return datos as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}
