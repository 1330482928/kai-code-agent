import type { ModelProfile } from "../config/model-config.js";

import { OpenAIProvider, type OpenAIProviderOptions } from "./openai.js";
import { ProviderError, type ProviderAdapter } from "./types.js";

export interface ProviderFactoryOptions {
  fetch?: OpenAIProviderOptions["fetch"];
}

export function createProvider(
  profile: ModelProfile,
  options: ProviderFactoryOptions = {},
): ProviderAdapter {
  if (profile.provider === "openai") {
    return new OpenAIProvider({
      baseURL: profile.baseURL,
      apiKey: profile.apiKey,
      fetch: options.fetch,
    });
  }

  throw new ProviderError(`Unsupported provider '${profile.provider}'`);
}
