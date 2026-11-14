import { describe, expect, it } from "vitest";
import { formatCardValue } from "../data";

describe("formatCardValue", () => {
  it("keeps one decimal on millions, the number a KPI card exists to show", () => {
    expect(formatCardValue(22_200_000)).toBe("22.2m");
    expect(formatCardValue(22_000_000)).toBe("22m");
  });

  it("scales to thousands and billions", () => {
    expect(formatCardValue(1_250)).toBe("1.3k");
    expect(formatCardValue(4_200_000_000)).toBe("4.2b");
    expect(formatCardValue(-1_500_000)).toBe("-1.5m");
  });

  it("leaves small and empty values alone", () => {
    expect(formatCardValue(950)).toBe("950");
    expect(formatCardValue(12.345)).toBe("12.35");
    expect(formatCardValue(Number.NaN)).toBe("–");
  });
});
