#!/usr/bin/env node
import { parseArgs } from 'node:util'

// The agent's side of the live conversation: posts one message to a running
// serve.mjs instance, which broadcasts it to every open tab over SSE. This is
// the only way the agent speaks into the page — there is no shared process,
// so each remark is one local HTTP call, not a persistent connection.
export async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string', default: '4390' },
      text: { type: 'string' },
    },
  })

  if (!values.text) {
    console.error('Usage: say.mjs --text "..." [--port N]')
    process.exitCode = 1
    return
  }

  let response
  try {
    response = await fetch(`http://127.0.0.1:${values.port}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: values.text }),
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
