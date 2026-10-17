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
  | { tipo: 'titulo'; nivel: number; texto: string }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'lista'; ordenada: boolean; items: string[] }
  | { tipo: 'cita'; lineas: string[] }
  | { tipo: 'regla' }
  | { tipo: 'codigo'; lenguaje: string; codigo: string; cerrado: boolean }

const TITULO = /^(#{1,6})\s+(.*)$/
const VINETA = /^\s*[-*+]\s+/
const NUMERADA = /^\s*\d+[.)]\s+/
const CITA = /^\s*>\s?/
const REGLA = /^\s*(?:---+|\*\*\*+|___+)\s*$/

/** Una línea que empieza un bloque propio no puede quedarse dentro de un párrafo. */
function abreBloque(linea: string): boolean {
  return (
    linea.trim() === '' ||
    /^```/.test(linea) ||
    TITULO.test(linea) ||
    VINETA.test(linea) ||
    NUMERADA.test(linea) ||
    CITA.test(linea) ||
    REGLA.test(linea)
  )
}

/** Se exporta para poder probarla con texto real sin montar React. */
export function partir(markdown: string): Bloque[] {
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

    const titulo = TITULO.exec(linea)
    if (titulo) {
      bloques.push({ tipo: 'titulo', nivel: titulo[1].length, texto: titulo[2] })
      i += 1
      continue
    }

    if (REGLA.test(linea)) {
      bloques.push({ tipo: 'regla' })
      i += 1
      continue
    }

    if (CITA.test(linea)) {
      const dentro: string[] = []
      while (i < lineas.length && CITA.test(lineas[i])) {
        dentro.push(lineas[i].replace(CITA, ''))
        i += 1
      }
      bloques.push({ tipo: 'cita', lineas: dentro })
      continue
    }

    // Una lista numerada y una de viñetas no se mezclan en el mismo bloque.
    const ordenada = NUMERADA.test(linea)
    if (ordenada || VINETA.test(linea)) {
      const marca = ordenada ? NUMERADA : VINETA
      const items: string[] = []
      while (i < lineas.length && marca.test(lineas[i])) {
        items.push(lineas[i].replace(marca, ''))
        i += 1
        // Una línea suelta debajo de un punto le pertenece: el modelo parte
        // las frases largas y sin esto cada trozo se volvía un párrafo aparte.
        while (i < lineas.length && lineas[i].trim() !== '' && !abreBloque(lineas[i])) {
          items[items.length - 1] += ` ${lineas[i].trim()}`
          i += 1
        }
      }
      bloques.push({ tipo: 'lista', ordenada, items })
      continue
    }

    if (linea.trim() === '') {
      i += 1
      continue
    }

    const parrafo: string[] = []
    // La primera línea entra siempre; las siguientes solo si no abren bloque.
    parrafo.push(lineas[i])
    i += 1
    while (i < lineas.length && !abreBloque(lineas[i])) {
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
        if (bloque.tipo === 'titulo') {
          // Dentro de una respuesta no hay h1 ni h2 de verdad: el título de
          // la página es otro. Y "###" es lo que más escriben los modelos, así
          // que ese es el subtítulo normal, no el más pequeño y apagado.
          const Etiqueta = (bloque.nivel <= 3 ? 'h3' : bloque.nivel === 4 ? 'h4' : 'h5') as
            | 'h3'
            | 'h4'
            | 'h5'
          return (
            <Etiqueta key={i} dangerouslySetInnerHTML={{ __html: enLinea(bloque.texto) }} />
          )
        }
        if (bloque.tipo === 'regla') {
          return <hr key={i} />
        }
        if (bloque.tipo === 'cita') {
          return (
            <blockquote key={i}>
              {bloque.lineas.map((linea, j) => (
                <p key={j} dangerouslySetInnerHTML={{ __html: enLinea(linea) }} />
              ))}
            </blockquote>
          )
        }
        if (bloque.tipo === 'lista') {
          const Etiqueta = bloque.ordenada ? 'ol' : 'ul'
          return (
            <Etiqueta key={i}>
              {bloque.items.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: enLinea(item) }} />
              ))}
            </Etiqueta>
          )
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: enLinea(bloque.texto) }} />
      })}
    </>
  )
})
