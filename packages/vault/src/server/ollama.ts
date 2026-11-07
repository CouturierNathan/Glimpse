import { ExtractionError } from './extraction.ts'
import type { ExtractionModel } from './extraction.ts'
/** Loopback-only provider. No credentials, cloud URLs, redirects or document-selected endpoints. */
export function createOllamaModel(
  model: string,
  transport: typeof fetch = globalThis.fetch,
): ExtractionModel {
  if (!/^[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+$/.test(model) || /cloud/i.test(model)) {
    throw new ExtractionError()
  }
  return {
    name: `ollama-local:${model}`,
    async complete(system, data) {
      try {
        const response = await transport('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: data },
            ],
            format: 'json',
            stream: false,
            keep_alive: 0,
            options: { temperature: 0, num_predict: 2048 },
          }),
        })
        if (!response.ok || !response.body) throw new ExtractionError()
        const reader = response.body.getReader()
        let size = 0
        const chunks: Uint8Array[] = []
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            size += value.byteLength
            chunks.push(value)
            if (size > 64 * 1024) throw new ExtractionError()
          }
        } catch {
          chunks.forEach((chunk) => chunk.fill(0))
          throw new ExtractionError()
        } finally {
          await reader.cancel()
          if (size > 64 * 1024) chunks.forEach((chunk) => chunk.fill(0))
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.length
          chunk.fill(0)
        }
        try {
          const body = JSON.parse(new TextDecoder().decode(bytes)) as {
            message?: { content?: unknown }
          }
          if (typeof body.message?.content !== 'string') throw new ExtractionError()
          return JSON.parse(body.message.content) as unknown
        } finally {
          bytes.fill(0)
        }
      } catch {
        throw new ExtractionError()
      }
    },
  }
}
