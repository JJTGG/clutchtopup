import "server-only";

type NexusSandboxStatus = {
  mode: string;
  realMoney: boolean;
  providers: string[];
};

export async function getNexusSandboxStatus(): Promise<NexusSandboxStatus> {
  const baseUrl = process.env.NEXUS_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      "NEXUS_BASE_URL is not configured.",
    );
  }

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/api/v1/sandbox`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  const text = await response.text();

  let body: unknown = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      "Nexus sandbox check returned invalid JSON.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Nexus sandbox check failed with HTTP ${response.status}.`,
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).mode !==
      "string" ||
    typeof (body as Record<string, unknown>).realMoney !==
      "boolean"
  ) {
    throw new Error(
      "Nexus sandbox check returned an unexpected response.",
    );
  }

  const result =
    body as Record<string, unknown>;

  return {
    mode: result.mode as string,
    realMoney: result.realMoney as boolean,
    providers: Array.isArray(result.providers)
      ? result.providers.filter(
          (provider): provider is string =>
            typeof provider === "string",
        )
      : [],
  };
}