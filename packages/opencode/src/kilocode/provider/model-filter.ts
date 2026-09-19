import type { Provider } from "@/provider/provider"
export function filterPromptTrainingModels(providers: Record<string, Provider.Info>, _hide: boolean) {
  return providers
}

export function nonEmptyProviders(providers: Record<string, Provider.Info>) {
  return Object.fromEntries(Object.entries(providers).filter(([, provider]) => Object.keys(provider.models).length > 0))
}
