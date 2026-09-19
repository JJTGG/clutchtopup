export type FulfillmentFieldType = "text" | "number";

export type FulfillmentField = {
  key: string;
  label: string;
  type: FulfillmentFieldType;
  required: boolean;
  placeholder?: string;
};

export type FulfillmentConfig = {
  fields: FulfillmentField[];
  regionRequired: boolean;
};