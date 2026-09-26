import { getTestServer } from "./parse-test-server";

export interface RestOptions {
  sessionToken?: string;
  masterKey?: boolean;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
}

/**
 * Calls the NestJS REST API of the test server
 */
export async function invokeRest<TResponse = unknown>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: RestOptions = {},
): Promise<TResponse> {
  const server = getTestServer();
  const url = new URL(`${server.apiURL}${path}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  const headers: Record<string, string> = {};
  if (options.sessionToken) {
    headers["Authorization"] = `Bearer ${options.sessionToken}`;
  }
  if (options.masterKey) {
    headers["X-Parse-Master-Key"] = server.masterKey;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed with ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as TResponse;
}
