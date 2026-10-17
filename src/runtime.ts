/**
 * El puente entre assistant-ui y nuestro canal.
 *
 * `useLocalRuntime` pide un adaptador con un solo método: `run`, que recibe el
 * hilo y una señal, y devuelve un generador con la respuesta mientras llega.
 * Eso encaja con el endpoint tal cual, y la señal es exactamente el botón de
 * parar — cerrar la lectura cierra la conexión, y el servidor deja de producir.
 */
import { useMemo } from 'react'
import { useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react'
import { enviarMensaje, type EventoChat } from './api/chat'

/** Un cuadro a 60 Hz. Debajo de esto, pintar otra vez no se ve. */
const CUADRO_MS = 16

export function useChatRuntime(
  conversationId: number | null,
  onEvento: (evento: EventoChat) => void,
) {
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal }) {
        if (conversationId === null) {
          yield { content: [{ type: 'text', text: 'Primero abre una conversación.' }] }
          return
        }

        const ultimo = messages[messages.length - 1]
        const texto = ultimo.content
          .filter((parte): parte is { type: 'text'; text: string } => parte.type === 'text')
          .map((parte) => parte.text)
          .join('')

        let acumulado = ''
        let ultimoPintado = 0

        for await (const evento of enviarMensaje(conversationId, texto, abortSignal)) {
          // El latido solo mantiene viva la conexión; no hay nada que pintar.
          if (evento.type === 'latido') continue

          if (evento.type === 'token') {
            acumulado += evento.text
            // Agrupar por cuadro: un yield por token hace que React re-renderice
            // por carácter y el chat se traba justo cuando debería verse vivo.
            const ahora = performance.now()
            if (ahora - ultimoPintado >= CUADRO_MS) {
              ultimoPintado = ahora
              yield { content: [{ type: 'text', text: acumulado }] }
            }
            continue
          }

          if (evento.type === 'error') {
            acumulado += `${acumulado ? '\n\n' : ''}No se pudo completar: ${evento.message}`
            yield { content: [{ type: 'text', text: acumulado }] }
            onEvento(evento)
            return
          }

          onEvento(evento)
        }

        // Lo que quedó en el buffer entre el último cuadro y el final. Sin
        // esto, la última palabra de cada respuesta no aparece.
        yield { content: [{ type: 'text', text: acumulado }] }
      },
    }),
    [conversationId, onEvento],
  )

  return useLocalRuntime(adapter)
}
