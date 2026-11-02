import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { networkIdOf } from "./config.ts";

describe("networkIdOf", () => {
  it("knows each network by its lr-node name, with core's id", () => {
    const chain = JSON.parse(
      readFileSync(
        new URL(
          "../../../crates/core/test-vectors/chain.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { networks: { name: string; networkId: number }[] };
    const id = (name: string) =>
      chain.networks.find((n) => n.name === name)?.networkId;
    expect(networkIdOf("test")).toBe(id("testnet"));
    expect(networkIdOf("dev")).toBe(id("dev"));
    expect(() => networkIdOf("main")).toThrow(/unknown network/);
    expect(() => networkIdOf("constructor")).toThrow(/unknown network/);
  });
});
