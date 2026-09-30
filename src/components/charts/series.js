import { COST_KEYS, COST_LABELS } from "../../lib/analytics.js";

export const SERIES_COLORS = { fuel: "#2a78d6", maintenance: "#eb6834", document: "#1baf7a", expense: "#eda100" };
export const SINGLE_COLOR = "#2a78d6";
export const GRID_COLOR = "#e6eaf0";
export const REF_COLOR = "#64748b";

export const COST_SERIES = COST_KEYS.map((key) => ({ key, label: COST_LABELS[key], color: SERIES_COLORS[key] }));
