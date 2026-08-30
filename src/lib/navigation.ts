import { BookOpen, Braces, Search, Table2 } from "lucide-react";
import type { SearchType } from "./search/search";

export type NavKey = "search" | "tables" | "standards" | "codes" | "sources";

export const navItems: { key: NavKey; label: string; icon: typeof Search }[] = [
  { key: "search", label: "全局搜索", icon: Search },
  { key: "tables", label: "表目录", icon: Table2 },
  { key: "standards", label: "数据标准", icon: BookOpen },
  { key: "codes", label: "公共代码", icon: Braces },
];

export const typeLabels: Record<SearchType, string> = {
  table: "表",
  field: "字段",
  standard: "标准",
  code: "代码",
  revision: "修订",
};

export const visibleSearchTypes: SearchType[] = [
  "table",
  "field",
  "standard",
  "code",
];

export type NavigationState = {
  activeWorkspace: DatasetSlotKey;
  activeNav: NavKey;
  query: string;
  searchFilter: SearchType | "all";
  selectedTableId: string;
  selectedFieldId: string | null;
  selectedStandardId: string | null;
  selectedCodeId: string | null;
};

// NavigationState 需要 slot 类型，但 lib 层不宜依赖 storage 模块细节，
// 这里用结构兼容的别名；App 传入的 DatasetSlot 与之同构。
export type DatasetSlotKey = "warehouse" | "retail";

type BrowserHistoryState = {
  view: NavigationState;
  navigationStack: NavigationState[];
};

export function readBrowserHistoryState(
  value: unknown,
): BrowserHistoryState | null {
  if (!value || typeof value !== "object") return null;
  const entry = (value as { dataDictionaryQueryDesk?: unknown })
    .dataDictionaryQueryDesk;
  if (!entry || typeof entry !== "object") return null;
  const { view, navigationStack } = entry as Partial<BrowserHistoryState>;
  return view && typeof view === "object" && Array.isArray(navigationStack)
    ? {
        view: view as NavigationState,
        navigationStack: navigationStack as NavigationState[],
      }
    : null;
}
