/**
 * La conversación.
 *
 * Sin bordes y sin tarjetas: lo que se lee es el texto, y todo lo demás
 * estorba. Las respuestas van en serif porque son para leer; lo que escribe
 * quien pregunta va en la tipografía de la interfaz, porque es un control.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ExportedMessageRepository,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import {
  useAdjuntos,
  useBorrarConversacion,
  useConsumo,
  useConversaciones,
  useCrearConversacion,
  useMensajes,
  useModelos,
  useQuitarAdjunto,
  useSubirAdjunto,
  type EventoChat,
} from '../api/chat'
import { sesion } from '../api/client'
import { Markdown } from '../components/Markdown'
import { useChatRuntime } from '../runtime'

function dinero(centavos: number): string {
  return `$${(centavos / 100).toFixed(2)}`
}

/** Lo que el navegador puede ofrecer; el servidor decide por los bytes. */
const ACEPTA = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown'

/** Un documento de 40 caracteres no es "0.0 k". */
function tamanoTexto(chars: number): string {
  return chars < 1000 ? `${chars} caracteres` : `${(chars / 1000).toFixed(1)} k de texto`
}

/**
 * Los documentos de la conversación.
 *
 * No cuelgan de un mensaje sino de la conversación entera, porque eso es lo que
 * viaja en cada turno. Por eso se dice cuánto texto arrastra cada uno: es lo
 * que se paga una y otra vez, y no lo que pesa el archivo.
 */
function Documentos({ conversationId }: { conversationId: number | null }) {
  const adjuntos = useAdjuntos(conversationId)
  const subir = useSubirAdjunto(conversationId)
  const quitar = useQuitarAdjunto(conversationId)
  const selector = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  if (conversationId === null) return null

  const elegir = async (archivos: FileList | null) => {
    if (!archivos?.length) return
    setError(null)
    for (const archivo of Array.from(archivos)) {
      try {
        await subir.mutateAsync(archivo)
      } catch (e) {
        setError(`${archivo.name}: ${e instanceof Error ? e.message : 'no se pudo subir'}`)
      }
    }
    if (selector.current) selector.current.value = ''
  }

  const lista = adjuntos.data ?? []

  return (
    <div className="documentos">
      {lista.map((a) => (
        <span key={a.id} className="documento">
          {a.filename}
          <small>{tamanoTexto(a.textChars)}</small>
          <button
            type="button"
            aria-label={`Quitar ${a.filename}`}
            onClick={() => void quitar.mutateAsync(a.id)}
          >
            ×
          </button>
        </span>
      ))}

      <button
        type="button"
        className="adjuntar"
        onClick={() => selector.current?.click()}
        disabled={subir.isPending}
      >
        {subir.isPending ? 'Leyendo…' : '+ documento'}
      </button>

      <input
        ref={selector}
        type="file"
        accept={ACEPTA}
        multiple
        hidden
        onChange={(e) => void elegir(e.target.files)}
      />

      {error && <span className="documento-error">{error}</span>}
    </div>
  )
}

function MensajeUsuario() {
  return (
    <MessagePrimitive.Root className="turno turno-usuario">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  )
}

function TextoDelAsistente({ text }: { text: string }) {
  return <Markdown texto={text} />
}

function MensajeAsistente() {
  return (
    <MessagePrimitive.Root className="turno turno-asistente">
      <MessagePrimitive.Parts components={{ Text: TextoDelAsistente }} />
    </MessagePrimitive.Root>
  )
}

export function ChatPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const conversationId = id ? Number(id) : null

  const conversaciones = useConversaciones()
  const mensajes = useMensajes(conversationId)
  const modelos = useModelos()
  const consumo = useConsumo()
  const crear = useCrearConversacion()
  const borrar = useBorrarConversacion()

  const [ultimoCosto, setUltimoCosto] = useState<number | null>(null)

  // El cron de la demostración borra las conversaciones cada hora, así que un
  // enlace de hace rato apunta a algo que ya no existe. Decirlo es mejor que
  // dejar la pantalla en blanco.
  const noExiste =
    mensajes.isError && (mensajes.error as { status?: number } | null)?.status === 404

  const alEvento = useCallback(
    (evento: EventoChat) => {
      if (evento.type === 'usage') setUltimoCosto(evento.costCents)
      if (evento.type === 'done') {
        // El stream vivió fuera de react-query a propósito; al terminar es
        // cuando vale la pena volver a pedir la lista y el consumo.
        qc.invalidateQueries({ queryKey: ['conversaciones'] })
        qc.invalidateQueries({ queryKey: ['consumo'] })
      }
    },
    [qc],
  )

  const runtime = useChatRuntime(conversationId, alEvento)

  // Lo ya guardado se carga una vez por conversación; lo nuevo lo pinta el
  // runtime. Mezclar las dos fuentes en el mismo render es pelear con la caché.
  //
  // El runtime es uno solo y no se entera de que cambiamos de conversación, así
  // que el hilo se reemplaza entero — también cuando la nueva está vacía. Sin
  // ese caso, abrir una conversación nueva deja en pantalla los mensajes de la
  // anterior.
  const cargada = useRef<number | null>(null)
  useEffect(() => {
    if (!conversationId || !mensajes.data || cargada.current === conversationId) return
    cargada.current = conversationId
    const previos = mensajes.data
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: [{ type: 'text' as const, text: m.content }],
      }))
    // `fromArray` convierte mensajes sueltos en el árbol que el runtime espera:
    // ids, padres y estado.
    runtime.thread.import(ExportedMessageRepository.fromArray(previos))
  }, [conversationId, mensajes.data, runtime])

  const nueva = async (model?: string) => {
    const creada = await crear.mutateAsync({ model })
    cargada.current = null
    navigate(`/c/${creada.id}`)
  }

  const actual = conversaciones.data?.find((c) => c.id === conversationId)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="pantalla">
        <aside className="lateral">
          <div className="lateral-cabecera">
            <button type="button" className="boton-nueva" onClick={() => void nueva()}>
              Nueva conversación
            </button>
          </div>

          <nav className="lista">
            {(conversaciones.data ?? []).map((c) => (
              <div key={c.id} className={`fila ${c.id === conversationId ? 'activa' : ''}`}>
                <button
                  type="button"
                  className="titulo"
                  onClick={() => {
                    cargada.current = null
                    navigate(`/c/${c.id}`)
                  }}
                >
                  <span>{c.title ?? 'Sin título'}</span>
                  <small>
                    {c.messageCount ?? 0} mensajes · {dinero(c.costCents ?? 0)}
                  </small>
                </button>
                <button
                  type="button"
                  className="quitar"
                  aria-label="Borrar conversación"
                  onClick={async () => {
                    await borrar.mutateAsync(c.id)
                    if (c.id === conversationId) navigate('/')
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </nav>

          <div className="lateral-pie">
            {consumo.data && (
              <p className="consumo">
                {dinero(consumo.data.costCents)} de {dinero(consumo.data.limitCents)} este mes
              </p>
            )}
            <p className="quien">{sesion.user?.fullName ?? ''}</p>
          </div>
        </aside>

        <main className="conversacion">
          <header className="cabecera">
            <div>
              <h1>{actual?.title ?? 'Conversación nueva'}</h1>
              <p className="modelo">
                {modelos.data?.find((m) => m.id === actual?.model)?.label ?? actual?.model ?? ''}
                {ultimoCosto !== null && ` · último turno ${dinero(ultimoCosto)}`}
              </p>
            </div>
          </header>

          <ThreadPrimitive.Root className="hilo">
            <ThreadPrimitive.Viewport className="vista" autoScroll>
              <ThreadPrimitive.Empty>
                {noExiste ? (
                  <div className="vacio">
                    <p>Esa conversación ya no está.</p>
                    <p className="nota">
                      Los datos de la demostración se reinician solos cada hora, así que los
                      enlaces viejos dejan de apuntar a algo. Abre una nueva y sigue.
                    </p>
                    <button type="button" className="boton-nueva" onClick={() => void nueva()}>
                      Nueva conversación
                    </button>
                  </div>
                ) : (
                <div className="vacio">
                  <p>Pregunta lo que quieras.</p>
                  <p className="nota">
                    Esta demostración contesta con un modelo simulado: no sale de este servidor
                    y no cuesta nada. El canal, el conteo de tokens y el botón de parar son los
                    de verdad.
                  </p>
                </div>
                )}
              </ThreadPrimitive.Empty>

              <ThreadPrimitive.Messages
                components={{ UserMessage: MensajeUsuario, AssistantMessage: MensajeAsistente }}
              />

              <ThreadPrimitive.ViewportFooter className="pie">
                <ThreadPrimitive.ScrollToBottom className="al-final">
                  Ir al final
                </ThreadPrimitive.ScrollToBottom>

                <Documentos conversationId={conversationId} />

                <ComposerPrimitive.Root className="redactor">
                  <ComposerPrimitive.Input
                    className="entrada"
                    placeholder="Escribe aquí…"
                    rows={1}
                    autoFocus
                  />
                  <ThreadPrimitive.If running={false}>
                    <ComposerPrimitive.Send className="enviar">Enviar</ComposerPrimitive.Send>
                  </ThreadPrimitive.If>
                  <ThreadPrimitive.If running>
                    <ComposerPrimitive.Cancel className="parar">Parar</ComposerPrimitive.Cancel>
                  </ThreadPrimitive.If>
                </ComposerPrimitive.Root>
              </ThreadPrimitive.ViewportFooter>
            </ThreadPrimitive.Viewport>
          </ThreadPrimitive.Root>
        </main>
      </div>
    </AssistantRuntimeProvider>
  )
}
