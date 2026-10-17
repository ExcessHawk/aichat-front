import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, refrescarSesion, sesion } from './client'

export interface Conversacion {
  id: number
  title: string | null
  model: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  messageCount?: number
  costCents?: number
}

export interface Mensaje {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  inputTokens: number
  outputTokens: number
  costCents: number
  stoppedByUser: boolean
  createdAt: string
}

export interface Modelo {
  id: string
  label: string
  inputCentsPerMillion: number
  outputCentsPerMillion: number
}

export interface Adjunto {
  id: number
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  /** Lo que de verdad viaja al modelo en cada turno. No es lo que pesa. */
  textChars: number
  truncado?: boolean
}

export interface Consumo {
  periodStart: string
  inputTokens: number
  outputTokens: number
  costCents: number
  limitCents: number
  restanteCents: number
}

export type EventoChat =
  /**
   * Señal de vida mientras el modelo piensa. No se pinta: solo evita que el
   * canal se quede mudo tanto rato que alguien lo dé por muerto y lo cierre.
   */
  | { type: 'latido' }
  | { type: 'token'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; costCents: number }
  | { type: 'done'; messageId: number; stopped: boolean }
  | { type: 'error'; message: string }

export function useConversaciones() {
  return useQuery({
    queryKey: ['conversaciones'],
    queryFn: () => api.get<{ conversations: Conversacion[] }>('/api/conversations'),
    select: (d) => d.conversations,
  })
}

export function useMensajes(conversationId: number | null) {
  return useQuery({
    queryKey: ['mensajes', conversationId],
    queryFn: () => api.get<{ messages: Mensaje[] }>(`/api/conversations/${conversationId}/messages`),
    select: (d) => d.messages,
    enabled: conversationId !== null,
  })
}

export function useModelos() {
  return useQuery({
    queryKey: ['modelos'],
    queryFn: () => api.get<{ models: Modelo[] }>('/api/models'),
    select: (d) => d.models,
    staleTime: Infinity,
  })
}

export function useConsumo() {
  return useQuery({
    queryKey: ['consumo'],
    queryFn: () => api.get<Consumo>('/api/usage'),
  })
}

export function useAdjuntos(conversationId: number | null) {
  return useQuery({
    queryKey: ['adjuntos', conversationId],
    queryFn: () =>
      api.get<{ attachments: Adjunto[] }>(`/api/conversations/${conversationId}/attachments`),
    select: (d) => d.attachments,
    enabled: conversationId !== null,
  })
}

export function useSubirAdjunto(conversationId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('conversationId', String(conversationId))
      form.append('file', file)
      // Sin Content-Type: lo pone el navegador con el boundary, y sin él el
      // servidor no puede separar las partes.
      const res = await fetch('/api/attachments', {
        method: 'POST',
        headers: sesion.token ? { Authorization: `Bearer ${sesion.token}` } : {},
        body: form,
      })
      const texto = await res.text()
      const datos = texto ? JSON.parse(texto) : null
      if (!res.ok) {
        throw new Error(datos?.error || datos?.detail || datos?.message || `Error ${res.status}`)
      }
      return datos as Adjunto
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adjuntos', conversationId] }),
  })
}

export function useQuitarAdjunto(conversationId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del<{ message: string }>(`/api/attachments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adjuntos', conversationId] }),
  })
}

export function useCrearConversacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { model?: string }) => api.post<Conversacion>('/api/conversations', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversaciones'] }),
  })
}

export function useBorrarConversacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del<{ message: string }>(`/api/conversations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversaciones'] }),
  })
}

/**
 * Lee el canal del turno.
 *
 * Es un POST, así que `EventSource` no sirve: hay que leer el cuerpo con
 * `fetch` y partirlo en bloques. El framework no escribe línea `event:`, de
 * modo que el tipo viaja dentro del JSON.
 *
 * La señal que entra es la que corta: cerrar la lectura cierra la conexión, y
 * el servidor lo nota y deja de producir.
 */
export async function* enviarMensaje(
  conversationId: number,
  content: string,
  signal: AbortSignal,
): AsyncGenerator<EventoChat> {
  const pedir = () =>
    fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sesion.token ? { Authorization: `Bearer ${sesion.token}` } : {}),
      },
      body: JSON.stringify({ content }),
      signal,
    })

  let res = await pedir()

  // El mismo reintento que el cliente normal: aquí el 401 llegaba como "no se
  // pudo completar" a media conversación, que es la peor forma de enterarse.
  if (res.status === 401 && (await refrescarSesion())) {
    res = await pedir()
  }

  if (!res.ok || !res.body) {
    const texto = await res.text().catch(() => '')
    let mensaje = `Error ${res.status}`
    try {
      const datos = JSON.parse(texto)
      mensaje = datos.error || datos.detail || datos.message || mensaje
    } catch {
      /* el cuerpo no era JSON */
    }
    yield { type: 'error', message: mensaje }
    return
  }

  const lector = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await lector.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let corte = buffer.indexOf('\n\n')
    while (corte !== -1) {
      const bloque = buffer.slice(0, corte)
      buffer = buffer.slice(corte + 2)
      corte = buffer.indexOf('\n\n')

      const linea = bloque.split('\n').find((l) => l.startsWith('data:'))
      if (!linea) continue
      try {
        yield JSON.parse(linea.slice(5).trim()) as EventoChat
      } catch {
        /* bloque partido a la mitad: el siguiente lo completa */
      }
    }
  }
}
