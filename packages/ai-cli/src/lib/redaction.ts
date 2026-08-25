const sensitiveValues = new Set<string>();

export function registerSensitiveValue(value: string): void {
  if (value.length >= 6) sensitiveValues.add(value);
}

export function safeErrorMessage(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env
): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSensitiveText(message, env);
}

export function redactSensitiveText(
  input: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  let output = input
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(/\b(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@");

  const configuredKey = env[env.AI_CLI_API_KEY_ENV ?? ""];
  if (configuredKey && configuredKey.length >= 6) {
    output = output.split(configuredKey).join("[REDACTED]");
  }
  for (const value of sensitiveValues) {
    output = output.split(value).join("[REDACTED]");
  }
  for (const [name, value] of Object.entries(env)) {
    if (!/(?:API_?KEY|TOKEN|SECRET|PASSWORD)$/i.test(name)) continue;
    if (!value || value.length < 6) continue;
    output = output.split(value).join("[REDACTED]");
  }

  return output;
}
