export type DetectedField = {
  internalId: string;
  tagName: string;
  inputType?: string;
  role?: string | null;
  name?: string | null;
  id?: string | null;
  ariaLabel?: string | null;
  ariaLabelledByText?: string | null;
  placeholder?: string | null;
  labelText?: string | null;
  nearbyText: string[];
  sectionText?: string | null;
  currentValue?: string | null;
  options?: string[];
  required: boolean;
  disabled: boolean;
  readonly: boolean;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type ApprovedSuggestion = {
  internalId: string;
  value: string;
};

export type FillResult = {
  internalId: string;
  success: boolean;
  message: string;
};
