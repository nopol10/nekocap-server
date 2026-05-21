import { register } from "tsx/cjs/api";

register();

process.env.PARSE_SERVER_APPLICATION_ID ??= "test-app";
process.env.PARSE_SERVER_MASTER_KEY ??= "test-master";
process.env.NODE_ENV ??= "test";
