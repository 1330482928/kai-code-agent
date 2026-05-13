export const SECRET_MASK = "************";

export function maskSecret(value: string | null | undefined): string {
  return value && value.length > 0 ? SECRET_MASK : "";
}

export function redactSecret(value: string | null | undefined): string {
  return maskSecret(value) || "<empty>";
}
