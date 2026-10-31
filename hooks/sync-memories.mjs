#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
import * as nodeModule from "node:module";

// Stripping types costs about 30 ms on every start, and only plain JS runs before the cache is on, so
// this launcher stays .mjs. From Node 24 the cache also skips the stripping; on Node 22 it saves only the compile.
// enableCompileCache arrived in Node 22.8; a named import would fail to link on 22.6 and break fail-open.
nodeModule.enableCompileCache?.();
await import("./sync-memories.mts");
