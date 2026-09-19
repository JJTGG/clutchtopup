export type FulfillmentFieldType =
  | "text"
  | "number"
  | "select";

export type FulfillmentField = {
  key: string;
  label: string;
  type: FulfillmentFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
};

export type FulfillmentConfig = {
  fields: FulfillmentField[];
  regionRequired: boolean;
};

export function parseFulfillmentConfig(
  value: unknown,
): FulfillmentConfig {
  if (!value || typeof value !== "object") {
    throw new Error(
      "Invalid fulfillment configuration.",
    );
  }

  const config = value as Record<string, unknown>;

  if (!Array.isArray(config.fields)) {
    throw new Error("Invalid fulfillment fields.");
  }

  if (
    typeof config.regionRequired !==
    "boolean"
  ) {
    throw new Error(
      "Invalid region configuration.",
    );
  }

  const fields: FulfillmentField[] =
    config.fields.map(
      (field): FulfillmentField => {
        if (
          !field ||
          typeof field !== "object"
        ) {
          throw new Error(
            "Invalid fulfillment field.",
          );
        }

        const item =
          field as Record<string, unknown>;

        if (
          typeof item.key !== "string" ||
          typeof item.label !== "string" ||
          !(
            item.type === "text" ||
            item.type === "number" ||
            item.type === "select"
          ) ||
          typeof item.required !== "boolean"
        ) {
          throw new Error(
            "Invalid fulfillment field.",
          );
        }

        if (
          item.options !== undefined &&
          (
            !Array.isArray(item.options) ||
            !item.options.every(
              (option) =>
                typeof option ===
                "string",
            )
          )
        ) {
          throw new Error(
            "Invalid fulfillment field options.",
          );
        }

        return {
          key: item.key,
          label: item.label,
          type: item.type,
          required: item.required,
          ...(typeof item.placeholder ===
          "string"
            ? {
                placeholder:
                  item.placeholder,
              }
            : {}),
          ...(Array.isArray(item.options)
            ? {
                options: item.options,
              }
            : {}),
        };
      },
    );

  return {
    fields,
    regionRequired:
      config.regionRequired,
  };
}