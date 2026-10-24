import { getConnectionToken } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { getTestServer } from "./parse-test-server";

/**
 * Raw access to the test database, to assert on Parse's on-disk format
 */
export const rawCollection = (name: string) => {
  const connection = getTestServer().nestApp.get<string, Connection>(
    getConnectionToken(),
  );
  return connection.db!.collection(name);
};
