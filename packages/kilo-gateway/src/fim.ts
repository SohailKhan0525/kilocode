import { getAutocompleteModel, type DirectAutocompleteProviderID } from "./autocomplete.js"

export { requestMistralFim } from "./mistral-fim-endpoint.js"

export const DIRECT_FIM_ENV: Record<DirectAutocompleteProviderID, string[]> = {
  mistral: ["MISTRAL_API_KEY"],
  inception: ["INCEPTION_API_KEY"],
}

export type FimTarget =
  | { provider: "inception"; model: string; url: string }
  | { provider: "mistral"; model: string }

const INCEPTION_FIM_URL = "https://api.inceptionlabs.ai/v1/fim/completions"

export function resolveFimTarget(provider?: string, model?: string): FimTarget {
  const info = getAutocompleteModel(provider, model)
  if (info.directProvider === "mistral") return { provider: "mistral", model: info.requestModel }
  if (info.directProvider === "inception") return { provider: "inception", model: info.requestModel, url: INCEPTION_FIM_URL }
  throw new Error("Unsupported autocomplete provider")
}
