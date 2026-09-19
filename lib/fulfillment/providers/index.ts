import type { FulfillmentProvider } from "@/lib/fulfillment/provider";
import { gameCoreProvider } from "@/lib/fulfillment/providers/gamecore";

const providers = new Map<string, FulfillmentProvider>();

export function registerProvider(provider: FulfillmentProvider) {
  if (providers.has(provider.name)) {
    throw new Error(
      `Provider "${provider.name}" is already registered.`,
    );
  }

  providers.set(provider.name, provider);
}

export function getProvider(name: string) {
  const provider = providers.get(name);

  if (!provider) {
    throw new Error(
      `Fulfillment provider "${name}" is not registered.`,
    );
  }

  return provider;
}

export function listProviders() {
  return [...providers.values()];
}

/*
 * Built-in providers.
 *
 * Registration happens when this module is loaded.
 * Provider-specific implementation stays inside each adapter.
 */
registerProvider(gameCoreProvider);