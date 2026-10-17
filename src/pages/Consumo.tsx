/**
 * Lo que va gastado.
 *
 * Una pantalla de dinero no se adorna: el número grande es el que importa y el
 * resto es contexto.
 */
import { Link } from 'react-router-dom'
import { useConsumo, useConversaciones, useModelos } from '../api/chat'

const dinero = (centavos: number) => `$${(centavos / 100).toFixed(2)}`

export function ConsumoPage() {
  const consumo = useConsumo()
  const conversaciones = useConversaciones()
  const modelos = useModelos()

  if (consumo.isLoading) return <div className="centrado">Cargando…</div>
  if (!consumo.data) return <div className="centrado">No se pudo leer el consumo.</div>

  const { costCents, limitCents, inputTokens, outputTokens, periodStart } = consumo.data
  const porcentaje = Math.min(100, Math.round((costCents / Math.max(1, limitCents)) * 100))

  return (
    <div className="consumo-pantalla">
      <header>
        <Link to="/" className="volver">
          ← Volver al chat
        </Link>
        <h1>Consumo</h1>
        <p className="nota">
          Periodo desde el {new Date(periodStart).toLocaleDateString('es-MX')}. El tope se revisa
          antes de llamar al modelo, no después.
        </p>
      </header>

      <section className="numero">
        <strong>{dinero(costCents)}</strong>
        <span>de {dinero(limitCents)}</span>
        <div className="barra">
          <div style={{ width: `${porcentaje}%` }} />
        </div>
      </section>

      <section className="rejilla">
        <div>
          <span>{inputTokens.toLocaleString('es-MX')}</span>
          <small>tokens de entrada</small>
        </div>
        <div>
          <span>{outputTokens.toLocaleString('es-MX')}</span>
          <small>tokens de salida</small>
        </div>
        <div>
          <span>{conversaciones.data?.length ?? 0}</span>
          <small>conversaciones</small>
        </div>
      </section>

      <section>
        <h2>Precio por modelo</h2>
        <table>
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Entrada</th>
              <th>Salida</th>
            </tr>
          </thead>
          <tbody>
            {(modelos.data ?? []).map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                <td>{dinero(m.inputCentsPerMillion)} / millón</td>
                <td>{dinero(m.outputCentsPerMillion)} / millón</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Por conversación</h2>
        <table>
          <tbody>
            {(conversaciones.data ?? []).map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/c/${c.id}`}>{c.title ?? 'Sin título'}</Link>
                </td>
                <td>{c.messageCount ?? 0} mensajes</td>
                <td>{dinero(c.costCents ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
