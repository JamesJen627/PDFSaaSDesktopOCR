const RUNNING_PORT_PREFIX = "running on port: ";

/**
 * Extract port from Stirling-PDF stdout line:
 * `Stirling-PDF running on port: 8080`
 */
export function extractPortFromRunningLog(logLine: string): number | null {
  const index = logLine.indexOf(RUNNING_PORT_PREFIX);
  if (index === -1) {
    return null;
  }

  const afterPrefix = logLine.slice(index + RUNNING_PORT_PREFIX.length);
  let digits = "";
  for (const char of afterPrefix) {
    if (char >= "0" && char <= "9") {
      digits += char;
    } else {
      break;
    }
  }

  if (!digits) {
    return null;
  }

  const port = Number.parseInt(digits, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
    return null;
  }

  return port;
}
