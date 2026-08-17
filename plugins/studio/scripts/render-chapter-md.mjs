#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

// The portability fallback the framework requires: the same chapter payload,
// readable with no renderer, no engine, and no browser. Answers are collapsed
// rather than omitted so the document still works as a self-test.

const GLYPHS = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

export function boardDiagram(fen, orientation = 'white') {
  const rows = fen.split(' ')[0].split('/').map((row) => {
    const squares = []
    for (const char of row) {
      if (/\d/.test(char)) squares.push(...Array(Number(char)).fill('·'))
      else squares.push(GLYPHS[char] ?? char)
    }
    return squares
  })
  const ranks = orientation === 'black' ? [...rows].reverse() : rows
  const files = orientation === 'black' ? 'hgfedcba' : 'abcdefgh'
  const lines = ranks.map((squares, i) => {
    const label = orientation === 'black' ? i + 1 : 8 - i
    const cells = orientation === 'black' ? [...squares].reverse() : squares
    return `${label} ${cells.join(' ')}`
  })
  lines.push(`  ${files.split('').join(' ')}`)
  return lines.join('\n')
}

function formatEval(cp, mate) {
  if (mate !== null && mate !== undefined) return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`
  if (cp === null || cp === undefined) return ''
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`
}

function details(summary, body) {
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`
}

function renderBlock(block) {
  switch (block.type) {
    case 'prose':
      return block.body
    case 'callout':
      return `> **${block.title ?? block.variant ?? 'Note'}**\n>\n${block.body
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}`
    case 'board': {
      const parts = ['```', boardDiagram(block.fen, block.orientation), '```']
      if (block.caption) parts.push(`*${block.caption}*`)
      if (block.line?.moves?.length) parts.push(`Line: ${block.line.moves.join(' ')}`)
      parts.push(`\`${block.fen}\``)
      return parts.join('\n\n')
    }
    case 'game': {
      const worst = (block.evalGraph ?? [])
        .filter((point) => point.classification && !['ok', 'best'].includes(point.classification))
        .map((point) => `- ply ${point.ply}: ${point.classification} (${formatEval(point.cp)})`)
      return [
        '```',
        block.pgn.trim(),
        '```',
        worst.length ? `**Turning points**\n\n${worst.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    }
    case 'exercise': {
      const parts = ['```', boardDiagram(block.fen, block.orientation), '```', `**${block.question}**`]
      if (block.options?.length) parts.push(block.options.map((option, i) => `${i + 1}. ${option}`).join('\n'))
      if (block.hints?.length) {
        parts.push(details('Hints', block.hints.map((hint, i) => `${i + 1}. ${hint}`).join('\n')))
      }
      const answers = (block.answers ?? [])
        .map((answer) => {
          const label = answer.move ?? answer.text ?? answer.option
          return `- ${answer.correct ? '**' + label + '** ✓' : label} — ${answer.feedback}`
        })
        .join('\n')
      parts.push(details('Answer', [answers, block.explanation].filter(Boolean).join('\n\n')))
      return parts.join('\n\n')
    }
    case 'compare': {
      const side = (s) =>
        [`**${s.label}** ${formatEval(s.evalCp)}`, '```', boardDiagram(s.fen), '```', s.caption ?? '']
          .filter(Boolean)
          .join('\n')
      return [side(block.left), side(block.right), block.note ?? ''].filter(Boolean).join('\n\n')
    }
    case 'quiz': {
      const options = block.options.map((option, i) => `${i + 1}. ${option.text}`).join('\n')
      const answers = block.options
        .map((option, i) => `${i + 1}. ${option.correct ? '✓' : '✗'} ${option.feedback}`)
        .join('\n')
      return [`**${block.question}**`, options, details('Answer', answers)].join('\n\n')
    }
    case 'recap':
      return block.points.map((point) => `- ${point}`).join('\n')
    default:
      return `<!-- unsupported block type: ${block.type} -->`
  }
}

export function renderChapter(chapter) {
  const out = [`# ${chapter.title}`]
  if (chapter.subtitle) out.push(`*${chapter.subtitle}*`)
  if (chapter.estimatedMinutes) out.push(`Estimated time: ${chapter.estimatedMinutes} minutes`)
  if (chapter.provenance) {
    const p = chapter.provenance
    out.push(
      `> Evidence: ${[p.engine && `${p.engine} at depth ${p.depth}`, p.source, p.generatedAt]
        .filter(Boolean)
        .join(' · ')}`,
    )
  }
  for (const section of chapter.sections) {
    out.push(`## ${section.heading}`)
    for (const block of section.blocks) out.push(renderBlock(block))
  }
  return `${out.join('\n\n')}\n`
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { data: { type: 'string' }, out: { type: 'string' } } })
  if (!values.data) {
    console.error('Usage: render-chapter-md.mjs --data <chapter.json> [--out <file.md>]')
    process.exitCode = 1
    return
  }
  const markdown = renderChapter(JSON.parse(await readFile(values.data, 'utf8')))
  if (values.out) {
    await writeFile(values.out, markdown)
    console.error(`Wrote ${values.out}`)
  } else {
    process.stdout.write(markdown)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
