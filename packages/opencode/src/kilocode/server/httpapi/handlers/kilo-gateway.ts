import { Effect } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { Auth } from "@/auth"
import { InstanceHttpApi } from "@/server/routes/instance/httpapi/api"
import { DIRECT_EDIT_ENV, extractFencedBody, resolveEditTarget } from "@kilocode/kilo-gateway/edit"
import { DIRECT_FIM_ENV, requestMistralFim, resolveFimTarget } from "@kilocode/kilo-gateway/fim"
import { buildMercuryEditPrompt } from "@kilocode/kilo-gateway/edit-prompt"
import { EditBody, FimBody } from "../groups/kilo-gateway"

const REQUEST_TIMEOUT_MS = 30_000

function directToken(auth: Auth.Service, provider: string, envKeys: string[]) {
  return Effect.gen(function* () {
    const item = yield* auth.get(provider).pipe(Effect.mapError(() => new HttpApiError.Unauthorized({})))
    if (item?.type === "api") return item.key
    return envKeys.map((key) => process.env[key]).find(Boolean)
  })
}

export const kiloGatewayHandlers = HttpApiBuilder.group(InstanceHttpApi, "kilo", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service

    const fim = Effect.fnUntraced(function* (ctx: { payload: typeof FimBody.Type }) {
      let target: ReturnType<typeof resolveFimTarget>
      try {
        target = resolveFimTarget(ctx.payload.provider, ctx.payload.model)
      } catch {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }

      const token = yield* directToken(auth, target.provider, DIRECT_FIM_ENV[target.provider])
      if (!token) return yield* Effect.fail(new HttpApiError.Unauthorized({}))

      const request = yield* HttpServerRequest.HttpServerRequest
      const signal =
        request.source instanceof Request
          ? AbortSignal.any([request.source.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
          : AbortSignal.timeout(REQUEST_TIMEOUT_MS)

      const response = yield* Effect.tryPromise(async () => {
        const run = async (url: string) =>
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            signal,
            body: JSON.stringify({
              model: target.model,
              prompt: ctx.payload.prefix,
              suffix: ctx.payload.suffix,
              max_tokens: ctx.payload.maxTokens ?? 256,
              temperature: ctx.payload.temperature ?? 0.2,
              stream: true,
            }),
          })
        return target.provider === "mistral" ? requestMistralFim(run) : run(target.url)
      })

      if (!response.ok) {
        const body = yield* Effect.promise(() => response.text())
        return HttpServerResponse.jsonUnsafe({ error: `FIM request failed: ${response.status} ${body}` }, { status: response.status })
      }
      if (!response.body) return HttpServerResponse.raw(null, { status: response.status })

      return HttpServerResponse.stream(
        Stream.fromReadableStream({ evaluate: () => response.body!, onError: (err) => err }),
        { contentType: "text/event-stream", headers: { "Cache-Control": "no-cache", Connection: "keep-alive" } },
      )
    })

    const edit = Effect.fnUntraced(function* (ctx: { payload: typeof EditBody.Type }) {
      let target: ReturnType<typeof resolveEditTarget>
      try {
        target = resolveEditTarget(ctx.payload.provider, ctx.payload.model)
      } catch {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }

      const token = yield* directToken(auth, target.provider, DIRECT_EDIT_ENV[target.provider])
      if (!token) return yield* Effect.fail(new HttpApiError.Unauthorized({}))

      const request = yield* HttpServerRequest.HttpServerRequest
      const signal =
        request.source instanceof Request
          ? AbortSignal.any([request.source.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
          : AbortSignal.timeout(REQUEST_TIMEOUT_MS)

      const content = buildMercuryEditPrompt({
        currentFilePath: ctx.payload.currentFilePath,
        currentFileContent: ctx.payload.currentFileContent,
        cursorLine: ctx.payload.cursorLine,
        cursorCharacter: ctx.payload.cursorCharacter,
        editableRegionStartLine: ctx.payload.editableRegionStartLine,
        editableRegionEndLine: ctx.payload.editableRegionEndLine,
        recentlyViewedSnippets: [...ctx.payload.recentlyViewedSnippets],
        editDiffHistory: [...ctx.payload.editDiffHistory],
      })

      const response = yield* Effect.tryPromise(() =>
        fetch(target.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          signal,
          body: JSON.stringify({
            model: target.model,
            max_tokens: ctx.payload.maxTokens ?? 512,
            messages: [{ role: "user", content }],
          }),
        }),
      )

      if (!response.ok) {
        const body = yield* Effect.promise(() => response.text())
        return HttpServerResponse.jsonUnsafe({ error: `Edit request failed: ${response.status} ${body}` }, { status: response.status })
      }

      const json = yield* Effect.promise(
        () =>
          response.json() as Promise<{
            choices?: Array<{ message?: { content?: string } }>
            usage?: { prompt_tokens?: number; completion_tokens?: number }
          }>,
      )
      const raw = json.choices?.[0]?.message?.content ?? ""
      return {
        content: extractFencedBody(raw),
        usage: json.usage
          ? { prompt_tokens: json.usage.prompt_tokens, completion_tokens: json.usage.completion_tokens }
          : undefined,
      }
    })

    return handlers.handle("fim", fim).handle("edit", edit)
  }),
)
