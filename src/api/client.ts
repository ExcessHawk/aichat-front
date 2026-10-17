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

/**
 * A dónde va alguien sin sesión.
 *
 * Esta caja es una demostración: la puerta de entrada es la demostración, no
 * un formulario de contraseña que nadie puede llenar. El formulario sigue en
 * /entrar para quien tenga cuenta de verdad.
 */
export const ENTRADA = '/demo?rol=usuario'

export const sesion = {
  get refreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY)
    } catch {
      return null
    }
  },
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

/**
 * Renueva la sesión con el token de refresco.
 *
 * Se guardaba desde el principio y no lo usaba nadie: a la hora caducaba el de
 * acceso, el 401 limpiaba todo y el visitante aterrizaba en un formulario de
 * contraseña. Varias peticiones pueden chocar con el 401 a la vez, así que la
 * renovación se comparte en vez de dispararse una por cada una.
 */
let renovando: Promise<string | null> | null = null

export function refrescarSesion(): Promise<string | null> {
  if (renovando) return renovando

  renovando = (async () => {
    const refreshToken = sesion.refreshToken
    if (!refreshToken) return null
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return null
      const datos = (await res.json()) as {
        token: string
        refreshToken: string
        user: SesionUsuario
      }
      sesion.guardar(datos)
      return datos.token
    } catch {
      return null
    } finally {
      renovando = null
    }
  })()

  return renovando
}

function alaEntrada() {
  sesion.limpiar()
  if (!location.pathname.startsWith('/demo') && !location.pathname.startsWith('/entrar')) {
    location.href = ENTRADA
  }
}

function cabeceras(conCuerpo: boolean): Record<string, string> {
  const h: Record<string, string> = {}
  const token = sesion.token
  if (token) h.Authorization = `Bearer ${token}`
  if (conCuerpo) h['Content-Type'] = 'application/json'
  return h
}

async function request<T>(method: string, path: string, body?: unknown, reintento = false): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: cabeceras(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    // Un solo reintento: si la renovación también da 401, el problema no es el
    // token caducado y repetir solo haría un bucle.
    if (!reintento && path !== '/api/auth/refresh' && (await refrescarSesion())) {
      return request<T>(method, path, body, true)
    }
    alaEntrada()
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
