import type { PaymentProvider } from "@/lib/payments/provider";

const providers = new Map<string, PaymentProvider>();

export function registerProvider(provider: PaymentProvider) {
  if (providers.has(provider.name)) {
    throw new Error(
      `Payment provider "${provider.name}" is already registered.`,
    );
  }

  providers.set(provider.name, provider);
}

export function getPaymentProvider(name: string) {
  const provider = providers.get(name);

  if (!provider) {
    throw new Error(
      `Payment provider "${name}" is not registered.`,
    );
  }

  return provider;
}

export function listPaymentProviders() {
  return [...providers.values()];
}