import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveTemplate, classifyLineItem, loadTemplates } from "./templates.js";

describe("resolveTemplate", () => {
  it("replaces all placeholders", () => {
    const result = resolveTemplate("Hello {{ name }}, you have {{ count }} items", {
      name: "World",
      count: 3,
    });
    assert.equal(result, "Hello World, you have 3 items");
  });

  it("preserves unmatched placeholders", () => {
    const result = resolveTemplate("{{ known }} and {{ unknown }}", { known: "yes" });
    assert.equal(result, "yes and {{ unknown }}");
  });

  it("handles placeholders without spaces", () => {
    const result = resolveTemplate("{{name}}", { name: "tight" });
    assert.equal(result, "tight");
  });

  it("returns string unchanged when no placeholders", () => {
    const result = resolveTemplate("no placeholders here", {});
    assert.equal(result, "no placeholders here");
  });
});

describe("classifyLineItem", () => {
  it("classifies budget items as aiUsage", () => {
    assert.equal(classifyLineItem("KI Budget Pro"), "aiUsage");
    assert.equal(classifyLineItem("Fair-Use Budget"), "aiUsage");
  });

  it("classifies fair-use items as aiUsage", () => {
    assert.equal(classifyLineItem("AI Fair-Use Package"), "aiUsage");
  });

  it("classifies everything else as license", () => {
    assert.equal(classifyLineItem("KI Plattform Pro"), "license");
    assert.equal(classifyLineItem("Enterprise License"), "license");
  });

  it("is case-insensitive", () => {
    assert.equal(classifyLineItem("BUDGET Plan"), "aiUsage");
    assert.equal(classifyLineItem("FAIR-USE plan"), "aiUsage");
  });
});

describe("loadTemplates", () => {
  it("returns defaults when no local file exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "tpl-test-"));
    try {
      const tpl = loadTemplates(tmp);
      assert.equal(tpl.timeToPay, 14);
      assert.ok(tpl.headText.length > 0);
      assert.ok(tpl.lineItemText.license);
      assert.ok(tpl.lineItemText.aiUsage);
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });

  it("uses local file when present", () => {
    const tmp = mkdtempSync(join(tmpdir(), "tpl-test-"));
    const custom = {
      timeToPay: 30,
      headText: "Custom head",
      footText: "Custom foot",
      lineItemText: { license: "Custom {{ duration }}", aiUsage: "Custom AI {{ duration }}" },
    };
    writeFileSync(join(tmp, "invoice-templates.local.json"), JSON.stringify(custom));
    try {
      const tpl = loadTemplates(tmp);
      assert.equal(tpl.timeToPay, 30);
      assert.equal(tpl.headText, "Custom head");
      assert.equal(tpl.lineItemText.license, "Custom {{ duration }}");
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });

  it("local file fully replaces defaults (no merge)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "tpl-test-"));
    const partial = { timeToPay: 7, headText: "Only this", footText: "", lineItemText: {} };
    writeFileSync(join(tmp, "invoice-templates.local.json"), JSON.stringify(partial));
    try {
      const tpl = loadTemplates(tmp);
      assert.equal(tpl.timeToPay, 7);
      assert.equal(tpl.headText, "Only this");
      assert.deepEqual(tpl.lineItemText, {});
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});
