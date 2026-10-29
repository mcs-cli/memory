#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
import { enableCompileCache } from "node:module";

// Stripping types costs about 30 ms on every start, and only plain JS runs before the cache is on, so
// this launcher stays .mjs and the cache keeps the stripped module until it changes.
enableCompileCache();
await import("./kb-gate.mts");
