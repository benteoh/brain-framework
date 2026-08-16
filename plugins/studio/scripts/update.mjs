#!/usr/bin/env node
import { parseArgs } from 'node:util'

// The agent's side of a live state push: posts one replacement state object
// to a running serve.mjs instance, which replaces its in-memory state and
// broadcasts it to every open tab as a {kind: 'state', data, at} SSE event.
// Mirrors say.mjs exactly, but for state (e.g. a new FEN after a chess move)
// rather than chat.
export async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string', default: '4390' },
      data: { type: 'string' },
    },
  })

  if (!values.data) {
    console.error('Usage: update.mjs --data \'{"...": "..."}\' [--port N]')
    process.exitCode = 1
    return
  }

  let data
  try {
    data = JSON.parse(values.data)
  } catch (error) {
    console.error(`--data must be valid JSON: ${error.message}`)
    process.exitCode = 1
    return
  }

  let response
  try {
    response = await fetch(`http://127.0.0.1:${values.port}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
  } catch (error) {
    console.error(`Could not reach server on port ${values.port}: ${error.message}`)
    process.exitCode = 1
    return
  }

  if (!response.ok) {
    console.error(`Server responded ${response.status}`)
    process.exitCode = 1
    return
  }

  console.log('Sent.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
}
