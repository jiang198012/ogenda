import { describe, it, expect, beforeEach } from "vitest";
import {
  statusStyle,
  categoryColorFor,
  hexToRgba,
  createColorResolver,
  CATEGORY_PALETTE,
} from "../../src/agenda-panel/colors";
import { setLanguage } from "../../src/i18n";

beforeEach(() => setLanguage("zh"));

describe("statusStyle", () => {
  it("maps the three known statuses to Chinese labels + fixed colors", () => {
    expect(statusStyle("confirmed")).toEqual({ label: "已确认", text: "#1e9e4a", bg: "#e3f7e8" });
    expect(statusStyle("tentative").label).toBe("待定");
    expect(statusStyle("tentative").text).toBe("#b26a00");
    expect(statusStyle("cancelled").label).toBe("已取消");
  });
  it("maps empty/undefined to 未设置 with a transparent pill", () => {
    expect(statusStyle("").label).toBe("未设置");
    expect(statusStyle(undefined).label).toBe("未设置");
    expect(statusStyle("").bg).toBe("transparent");
  });
  it("keeps an unknown non-empty status visible under its own name", () => {
    expect(statusStyle("NEEDS-ACTION").label).toBe("NEEDS-ACTION");
  });
});

describe("categoryColorFor", () => {
  it("is deterministic — same name always yields the same palette color", () => {
    expect(categoryColorFor("工作")).toBe(categoryColorFor("工作"));
    expect(CATEGORY_PALETTE).toContain(categoryColorFor("工作"));
  });
  it("maps various names into the palette", () => {
    for (const name of ["工作", "生活", "学习", "团队", "商务", "健康"]) {
      expect(CATEGORY_PALETTE).toContain(categoryColorFor(name));
    }
  });
  it("returns a neutral gray for an empty category", () => {
    expect(categoryColorFor("")).toBe("#98a0ad");
  });
});

describe("hexToRgba", () => {
  it("expands a 6-digit hex to rgba", () => {
    expect(hexToRgba("#4c8dff", 0.15)).toBe("rgba(76, 141, 255, 0.15)");
  });
  it("returns the input unchanged when it is not a 6-digit hex", () => {
    expect(hexToRgba("var(--x)", 0.15)).toBe("var(--x)");
  });
});

describe("createColorResolver", () => {
  it("resolves category color + pill bg", () => {
    const r = createColorResolver();
    expect(r.category("工作")).toBe(categoryColorFor("工作"));
    expect(r.categoryPillBg("工作")).toBe(hexToRgba(categoryColorFor("工作"), 0.15));
  });
  it("resolves status through the same object", () => {
    expect(createColorResolver().status("confirmed").label).toBe("已确认");
  });
});
