import { readFileSync } from "node:fs";
import { initSync } from "../pkg/lr_core.js";

initSync({
  module: readFileSync(new URL("../pkg/lr_core_bg.wasm", import.meta.url)),
});

/** Resolves once the WebAssembly module is loaded; already loaded in Node. */
export const ready: Promise<void> = Promise.resolve();

export * from "./api.ts";
