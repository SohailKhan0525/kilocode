import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "@/server/routes/instance/httpapi/middleware/authorization"
import { InstanceContextMiddleware } from "@/server/routes/instance/httpapi/middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "@/server/routes/instance/httpapi/middleware/workspace-routing"

const root = "/kilo"

export const FimBody = Schema.Struct({
  prefix: Schema.String,
  suffix: Schema.String,
  provider: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  maxTokens: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
})

export const EditBody = Schema.Struct({
  provider: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  maxTokens: Schema.optional(Schema.Finite),
  currentFilePath: Schema.String,
  currentFileContent: Schema.String,
  cursorLine: Schema.Finite,
  cursorCharacter: Schema.Finite,
  editableRegionStartLine: Schema.Finite,
  editableRegionEndLine: Schema.Finite,
  recentlyViewedSnippets: Schema.Array(Schema.Struct({ filepath: Schema.String, content: Schema.String })),
  editDiffHistory: Schema.Array(Schema.String),
})

export const EditResponse = Schema.Struct({
  content: Schema.String,
  usage: Schema.optional(
    Schema.Struct({
      prompt_tokens: Schema.optional(Schema.Finite),
      completion_tokens: Schema.optional(Schema.Finite),
    }),
  ),
})

export const KiloGatewayPaths = {
  fim: `${root}/fim`,
  edit: `${root}/edit`,
} as const

export const KiloGatewayApi = HttpApi.make("kilo")
  .add(
    HttpApiGroup.make("kilo")
      .add(
        HttpApiEndpoint.post("fim", KiloGatewayPaths.fim, {
          query: WorkspaceRoutingQuery,
          payload: FimBody,
          success: Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/event-stream" })),
          error: [HttpApiError.BadRequest, HttpApiError.Unauthorized],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "kilo.fim",
            summary: "Autocomplete FIM completion",
            description: "Generate a direct Fill-in-the-Middle completion using a configured provider.",
          }),
        ),
        HttpApiEndpoint.post("edit", KiloGatewayPaths.edit, {
          query: WorkspaceRoutingQuery,
          payload: EditBody,
          success: EditResponse,
          error: [HttpApiError.BadRequest, HttpApiError.Unauthorized],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "kilo.edit",
            summary: "Autocomplete Next Edit completion",
            description: "Generate a direct Mercury Next Edit completion using the configured Inception provider.",
          }),
        ),
      )
      .annotateMerge(OpenApi.annotations({ title: "kilo", description: "Autocomplete compatibility routes." }))
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "kilo HttpApi",
      version: "0.0.1",
      description: "Autocomplete HTTP compatibility surface.",
    }),
  )
