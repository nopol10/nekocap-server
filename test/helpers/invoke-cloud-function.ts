import Parse from "parse/node";

export interface InvokeOptions {
  sessionToken?: string;
}

export async function invokeCloudFunction<TResponse = unknown>(
  name: string,
  params: Record<string, unknown> = {},
  options: InvokeOptions = {},
): Promise<TResponse> {
  return Parse.Cloud.run(name, params, {
    sessionToken: options.sessionToken,
  }) as Promise<TResponse>;
}
