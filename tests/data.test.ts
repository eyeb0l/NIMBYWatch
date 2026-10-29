import { describe, it } from "node:test";
import assert from "node:assert/strict";
const expect = (value: unknown) => ({
  toBe: (expected: unknown) => assert.equal(value, expected),
  toBeNull: () => assert.equal(value, null),
  not: {
    toBeNull: () => assert.notEqual(value, null),
    toContain: (expected: string) =>
      assert.ok(!String(value).includes(expected)),
  },
});
import {
  mapStatus,
  normalizeCamden,
  residentialBasis,
  camdenUrl,
} from "../src/lib/data/camden";
const row = {
  application_number: "2026/1234/P",
  application_type: "Full Planning Permission",
  development_description: "Replace 2 flats with 3 flats",
  development_address: "Test site",
  registered_date: "2026-10-01T00:00:00.000",
  longitude: "-0.14",
  latitude: "51.54",
  full_application: {
    url: "https://planningrecords.camden.gov.uk/record?id=1",
  },
};
describe("Camden normalization", () => {
  it("maps explicit decisions and preserves pending and unknown", () => {
    expect(
      mapStatus(
        "Granted Subject to a Section 106 Legal Agreement",
        "Final Decision",
      ),
    ).toBe("approved");
    expect(mapStatus("Refused", "Appeal Lodged")).toBe("refused");
    expect(mapStatus(null, "Appeal Decided")).toBe("other");
    expect(mapStatus("Withdrawn Decision", "Withdrawn")).toBe("withdrawn");
    expect(mapStatus(null, "Registered")).toBe("pending");
    expect(mapStatus("Prior approval not required", "Final Decision")).toBe(
      "other",
    );
  });
  it("does not infer proposed, approved or net units from descriptive numbers", () => {
    const app = normalizeCamden(row, "2026-10-29T00:00:00Z")!;
    expect(app.proposedUnits).toBeNull();
    expect(app.netAdditionalUnits).toBeNull();
    expect(app.approvedUnits).toBeNull();
    expect(app.reference).toBe("2026/1234/P");
    expect(app.id).toBe("camden-2026-1234-P");
    expect(app.registeredDate).toBe("2026-10-01");
  });
  it("excludes flat roof false positives", () => {
    expect(
      residentialBasis({
        ...row,
        development_description: "Flat roof over office",
      }),
    ).toBeNull();
    expect(
      residentialBasis({
        ...row,
        development_description: "New flat with a flat roof",
      }),
    ).not.toBeNull();
  });
  it("treats missing and invalid coordinates/dates as unknown", () => {
    const app = normalizeCamden(
      {
        ...row,
        longitude: "",
        latitude: "not a number",
        registered_date: "bad",
      },
      "now",
    )!;
    expect(app.longitude).toBeNull();
    expect(app.latitude).toBeNull();
    expect(app.registeredDate).toBeNull();
  });
  it("drops personal fields and rejects unsafe source links", () => {
    const app = normalizeCamden(
      {
        ...row,
        applicant_name: "PERSON",
        full_application: { url: "javascript:alert(1)" },
      },
      "now",
    )!;
    expect(JSON.stringify(app)).not.toContain("PERSON");
    expect(app.sourceUrl.startsWith("https://opendata.camden.gov.uk/")).toBe(
      true,
    );
  });
  it("requires an identifier and preserves API query encoding", () => {
    expect(
      normalizeCamden({ ...row, application_number: "" }, "now"),
    ).toBeNull();
    expect(new URL(camdenUrl(200)).searchParams.get("$limit")).toBe("200");
  });
});

import { totalKnown } from "../src/lib/presentation";

describe("housing aggregate coverage", () => {
  it("keeps an entirely unknown housing total unknown", () => {
    const app = normalizeCamden(row, "2026-10-29T00:00:00Z")!;
    assert.deepEqual(totalKnown([app], "proposedUnits"), {
      known: 0,
      total: null,
    });
    assert.deepEqual(totalKnown([], "proposedUnits"), {
      known: 0,
      total: null,
    });
  });
  it("counts an explicit zero as known and excludes unknown values from coverage", () => {
    const app = normalizeCamden(row, "2026-10-29T00:00:00Z")!;
    const records = [
      app,
      { ...app, id: "zero", proposedUnits: 0 },
      { ...app, id: "five", proposedUnits: 5 },
    ];
    assert.deepEqual(totalKnown(records, "proposedUnits"), {
      known: 2,
      total: 5,
    });
    assert.deepEqual(totalKnown(records, "approvedUnits"), {
      known: 0,
      total: null,
    });
  });
});
