import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import "./VirtualList.css";

export interface VirtualListProps<T> {
  items: T[];
  getItemKey: (item: T) => string;
  renderItem: (item: T, selected: boolean) => ReactNode;
  onItemSelect?: (item: T) => void;
  className?: string;
  /** 行高需与内容匹配（compact 两行结构默认 58px），虚拟窗口按固定行高计算。 */
  rowHeight?: number;
  overscan?: number;
  footer?: ReactNode;
  ariaLabel?: string;
}

/**
 * 固定行高的虚拟滚动列表：无论数据多少，DOM 只保留可视窗口 + overscan。
 * 替代此前“滚动加载更多”的分页渲染，长列表（上千条）滚动不再累积节点。
 */
export default function VirtualList<T>({
  items,
  getItemKey,
  renderItem,
  onItemSelect,
  className = "",
  rowHeight = 58,
  overscan = 6,
  footer,
  ariaLabel,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(420);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => setViewport(element.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(
    items.length,
    Math.ceil((scrollTop + viewport) / rowHeight) + overscan,
  );
  const windowItems = items.slice(start, end);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, a, textarea, select")) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, items.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          event.preventDefault();
          onItemSelect?.(items[selectedIndex]);
        }
      }
    },
    [items, selectedIndex, onItemSelect],
  );

  // 键盘导航时把选中行滚入可视区
  useEffect(() => {
    if (selectedIndex < 0) return;
    const container = containerRef.current;
    if (!container) return;
    const top = selectedIndex * rowHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (top + rowHeight > container.scrollTop + container.clientHeight)
      container.scrollTop = top + rowHeight - container.clientHeight;
  }, [selectedIndex, rowHeight]);

  // 列表变短（过滤/删除）后收敛越界的选中项
  useEffect(() => {
    setSelectedIndex((index) => (index >= items.length ? -1 : index));
  }, [items.length]);

  return (
    <div className={`virtual-list ${className}`} aria-label={ariaLabel}>
      <div
        ref={containerRef}
        className="scroll-list"
        tabIndex={0}
        onScroll={(event: UIEvent<HTMLDivElement>) =>
          setScrollTop(event.currentTarget.scrollTop)
        }
        onKeyDown={handleKeyDown}
      >
        <div
          className="virtual-spacer"
          style={{ height: items.length * rowHeight }}
        >
          {windowItems.map((item, offset) => {
            const index = start + offset;
            return (
              <div
                key={getItemKey(item)}
                className="virtual-row"
                style={{ top: index * rowHeight, height: rowHeight }}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  setSelectedIndex(index);
                  onItemSelect?.(item);
                }}
              >
                <div className={`item ${selectedIndex === index ? "selected" : ""}`}>
                  {renderItem(item, selectedIndex === index)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {footer}
    </div>
  );
}
