import type { FulfillmentConfig } from "@/lib/fulfillment/config";

export function validateFulfillmentData(
  config: FulfillmentConfig,
  data: Record<string, unknown>,
) {
  for (const field of config.fields) {
    const value = data[field.key];

    if (
      field.required &&
      (value === undefined ||
        value === null ||
        String(value).trim() === "")
    ) {
      throw new Error(`${field.label} is required.`);
    }

    if (
      value !== undefined &&
      value !== null &&
      field.type === "number" &&
      !Number.isFinite(Number(value))
    ) {
      throw new Error(`${field.label} must be a valid number.`);
    }
  }

  if (config.regionRequired) {
    const region = data.region;

    if (
      region === undefined ||
      region === null ||
      String(region).trim() === ""
    ) {
      throw new Error("Region is required.");
    }
  }
}