/**
 * Markdown que tolera estar a medias.
 *
 * Esto se dibuja mientras llega, así que el texto siempre está incompleto: un
 * bloque de código sin cerrar, un asterisco suelto, una lista que empieza y no
 * termina. Nada de eso puede romper la pantalla, y por eso el recorrido es por
 * líneas y no un parser con estado que espere cierres.
 *
 * El resaltado lo pone shiki, que carga en diferido: un bloque de código sale
 * primero en texto plano y se colorea cuando el resaltador está listo. Mejor
 * eso que un hueco mientras llega el tema.
 */
import { memo, useEffect, useState } from 'react'
import { codeToHtml } from 'shiki'

type Bloque =
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'lista'; items: string[] }
  | { tipo: 'codigo'; lenguaje: string; codigo: string; cerrado: boolean }

function partir(markdown: string): Bloque[] {
  const bloques: Bloque[] = []
  const lineas = markdown.split('\n')

  let i = 0
  while (i < lineas.length) {
    const linea = lineas[i]

    // Código: lo primero, porque dentro no vale ninguna otra regla.
    const abre = /^```(\w*)\s*$/.exec(linea)
    if (abre) {
      const lenguaje = abre[1] || 'text'
      const cuerpo: string[] = []
      i += 1
      let cerrado = false
      while (i < lineas.length) {
        if (/^```\s*$/.test(lineas[i])) {
          cerrado = true
          i += 1
          break
        }
        cuerpo.push(lineas[i])
        i += 1
      }
      bloques.push({ tipo: 'codigo', lenguaje, codigo: cuerpo.join('\n'), cerrado })
      continue
    }

    if (/^\s*[-*]\s+/.test(linea)) {
      const items: string[] = []
      while (i < lineas.length && /^\s*[-*]\s+/.test(lineas[i])) {
        items.push(lineas[i].replace(/^\s*[-*]\s+/, ''))
        i += 1
      }
      bloques.push({ tipo: 'lista', items })
      continue
    }

    if (linea.trim() === '') {
      i += 1
      continue
    }

    const parrafo: string[] = []
    while (
      i < lineas.length &&
      lineas[i].trim() !== '' &&
      !/^```/.test(lineas[i]) &&
      !/^\s*[-*]\s+/.test(lineas[i])
    ) {
      parrafo.push(lineas[i])
      i += 1
    }
    bloques.push({ tipo: 'parrafo', texto: parrafo.join('\n') })
  }

  return bloques
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Negritas, cursivas y código en línea. Lo demás se queda como está. */
function enLinea(texto: string): string {
  return escapar(texto)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
}

function BloqueCodigo({ lenguaje, codigo }: { lenguaje: string; codigo: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let vigente = true
    codeToHtml(codigo, { lang: lenguaje, theme: 'vitesse-light' })
      .then((resultado) => {
        if (vigente) setHtml(resultado)
      })
      .catch(() => {
        // Un lenguaje que shiki no conoce no es motivo para no mostrar el
        // código.
        if (vigente) setHtml(null)
      })
    return () => {
      vigente = false
    }
  }, [codigo, lenguaje])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      /* sin permiso de portapapeles no hay nada que hacer */
    }
  }

  return (
    <div className="bloque-codigo">
      <button type="button" className="copiar" onClick={copiar}>
        {copiado ? 'copiado' : 'copiar'}
      </button>
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre>
          <code>{codigo}</code>
        </pre>
      )}
    </div>
  )
}

export const Markdown = memo(function Markdown({ texto }: { texto: string }) {
  const bloques = partir(texto)

  return (
    <>
      {bloques.map((bloque, i) => {
        if (bloque.tipo === 'codigo') {
          return <BloqueCodigo key={i} lenguaje={bloque.lenguaje} codigo={bloque.codigo} />
        }
        if (bloque.tipo === 'lista') {
          return (
            <ul key={i}>
              {bloque.items.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: enLinea(item) }} />
              ))}
            </ul>
          )
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: enLinea(bloque.texto) }} />
      })}
    </>
  )
})
