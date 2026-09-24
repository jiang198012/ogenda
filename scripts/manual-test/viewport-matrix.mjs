#!/usr/bin/env node

export const VIEWPORT_MATRIX = [
  { width: 360, lanes: 1, label: "手机窄边界" },
  { width: 361, lanes: 3, label: "三泳道下边界" },
  { width: 390, lanes: 3, label: "一般手机" },
  { width: 720, lanes: 3, label: "三泳道上边界" },
  { width: 721, lanes: 7, label: "桌面七泳道下边界" },
];

export function laneCountForWidth(width) {
  if (!Number.isFinite(width) || width <= 360) return 1;
  if (width <= 720) return 3;
  return 7;
}

export function acceptanceRows() {
  return VIEWPORT_MATRIX.map((item) => ({
    ...item,
    expected: `${item.lanes} 泳道`,
    checks: ["周视图高度与日视图小时高度一致", "事件标题可见两行", "无横向溢出"],
  }));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/viewport-matrix.mjs")) {
  console.log(JSON.stringify({
    matrix: acceptanceRows(),
    touch: ["空白触控点按新建", "长按移动事件", "拖动底部调整时长"],
    note: "真实设备/Obsidian 手工结果必须逐项记录截图和 PASS/FAIL，不由本脚本代替。",
  }, null, 2));
}
