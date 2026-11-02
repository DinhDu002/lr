import { describe, expect, it } from "vitest";
import { SendError } from "./gold.ts";
import { sendErrorText } from "./messages.ts";
import { NodeError } from "./node.ts";
import { LockedError } from "./vault.ts";

describe("sendErrorText", () => {
  it("explains each refusal of lr_sendTransaction", () => {
    const refused = (reason: string) =>
      sendErrorText(new NodeError(-32003, "x", reason));
    expect(refused("fee-too-low")).toMatch(/fee is too low/);
    expect(refused("dust")).toMatch(/at least 0.0003829 GOLD/);
    expect(refused("nonce-gap")).toMatch(/earlier send/);
    expect(refused("too-many")).toMatch(/too many sends waiting/);
    expect(refused("replacement-too-cheap")).toMatch(/same number/);
    expect(refused("mempool-full")).toMatch(/higher fee/);
    expect(refused("rule")).toMatch(/chain rule/);
    expect(refused("new-reason")).toBe("The Node refused: x");
  });

  it("knows an unreachable or busy Node, and passes the wallet's own checks on", () => {
    expect(sendErrorText(new NodeError(0, "x"))).toMatch(/nothing was sent/);
    expect(sendErrorText(new NodeError(-32005, "x"))).toMatch(/too many calls/);
    expect(
      sendErrorText(new SendError("The amount must be more than 0.")),
    ).toBe("The amount must be more than 0.");
    expect(sendErrorText(new LockedError())).toMatch(/locked/);
  });
});
