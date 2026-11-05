import { describe, expect, it } from "vitest";
import { inferField, looksLikeCode, parseCsv } from "../data";
import { applyFilters, defaultFilterMode, filterModeOf } from "../filters";
import type { Row } from "../types";

describe("identifier columns stay text", () => {
  it("keeps a digits-only SKU as text so leading zeros survive", () => {
    expect(inferField("SKU", ["0012345", "0012346"])).toEqual({ name: "SKU", type: "string" });
  });

  it("keeps a PO number as text even without leading zeros", () => {
    expect(inferField("Customer PO", ["4500123456"])).toEqual({ name: "Customer PO", type: "string" });
    expect(inferField("ST PO#", ["778899"])).toEqual({ name: "ST PO#", type: "string" });
  });

  it("treats a leading zero as proof of a code, whatever the column is called", () => {
    expect(looksLikeCode("Reference", ["007", "008"])).toBe(true);
    expect(inferField("Reference", ["007", "008"]).type).toBe("string");
  });

  it("still measures columns whose name says they are numbers", () => {
    expect(inferField("Order Month", ["202601", "202602"]).type).toBe("number");
    expect(inferField("Order Qty", ["10", "20"]).type).toBe("number");
    expect(inferField("Invoice Amount", ["100.50"]).type).toBe("number");
    expect(inferField("Total", ["1000"]).type).toBe("number");
  });

  it("leaves mixed alphanumeric ids as text, as before", () => {
    expect(inferField("SKU", ["SKU-1001", "SKU-1002"]).type).toBe("string");
  });

  it("does not touch real measurements that happen to have no name hint", () => {
    expect(inferField("Value", ["1", "2", "3"]).type).toBe("number");
  });
});

describe("parseCsv", () => {
  it("does not destroy leading zeros on the way in", () => {
    const csv = "SKU,PO Number,Qty\n0012345,0088776,3\n0012346,0088777,4";
    const source = parseCsv(csv, "orders");
    const field = (name: string) => source.fields.find((f) => f.name === name)?.type;

    expect(field("SKU")).toBe("string");
    expect(field("PO Number")).toBe("string");
    expect(field("Qty")).toBe("number");
    expect(source.rows[0].SKU).toBe("0012345");
    expect(source.rows[0]["PO Number"]).toBe("0088776");
    expect(source.rows[0].Qty).toBe(3);
  });
});

describe("defaultFilterMode", () => {
  it("opens identifiers as a value list and measurements as a range", () => {
    expect(defaultFilterMode({ name: "SKU", type: "string" })).toBe("values");
    expect(defaultFilterMode({ name: "PO Number", type: "number" })).toBe("values");
    expect(defaultFilterMode({ name: "Amount", type: "number" })).toBe("range");
    expect(defaultFilterMode({ name: "Region", type: "string" })).toBe("values");
    expect(defaultFilterMode({ name: "Order Month", type: "number" })).toBe("range");
  });

  it("lets an explicit mode override the default", () => {
    expect(filterModeOf({ field: "Amount", values: [], mode: "values" }, { name: "Amount", type: "number" })).toBe(
      "values",
    );
    expect(filterModeOf({ field: "SKU", values: [], mode: "range" }, { name: "SKU", type: "string" })).toBe("range");
  });
});

describe("filtering by values on a numeric column", () => {
  const rows: Row[] = [
    { SKU: "0012345", Amount: 10 },
    { SKU: "0012346", Amount: 20 },
    { SKU: "0012347", Amount: 20 },
  ];

  it("matches numbers picked from the list", () => {
    const out = applyFilters(rows, [{ field: "Amount", values: ["20"], mode: "values" }]);
    expect(out.map((r) => r.SKU)).toEqual(["0012346", "0012347"]);
  });

  it("keeps the leading zeros of a picked code", () => {
    const out = applyFilters(rows, [{ field: "SKU", values: ["0012346"], mode: "values" }]);
    expect(out).toHaveLength(1);
    expect(out[0].Amount).toBe(20);
  });

  it("ignores a range that the chip no longer shows", () => {
    // Switched to values but stale bounds are still in the object: they must not filter.
    const out = applyFilters(rows, [{ field: "Amount", values: ["20"], min: "100", max: "200", mode: "values" }]);
    expect(out).toHaveLength(2);
  });

  it("ignores picked values when the chip is a range", () => {
    const out = applyFilters(rows, [{ field: "Amount", values: ["10"], min: "15", mode: "range" }]);
    expect(out.map((r) => r.Amount)).toEqual([20, 20]);
  });
});
