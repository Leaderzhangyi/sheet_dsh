import { Clipboard, Database } from "lucide-react";
import type { FieldRecord } from "../lib/import/types";

export function KeyFlags({
  field,
  large = false,
}: {
  field: FieldRecord;
  large?: boolean;
}) {
  const flags = [
    { label: "PK", active: field.isPrimaryKey, tone: "red" },
    { label: "D", active: field.isDistributionKey, tone: "orange" },
    { label: "P", active: field.isPartitionKey, tone: "blue" },
  ];
  return (
    <span className={`key-flags ${large ? "large" : ""}`}>
      {flags.map((flag) => (
        <span
          key={flag.label}
          className={`key-flag ${flag.active ? `active ${flag.tone}` : ""}`}
          title={
            flag.label === "PK"
              ? "主键"
              : flag.label === "D"
                ? "分布键"
                : "分区键"
          }
        >
          {flag.label}
        </span>
      ))}
    </span>
  );
}

export function Property({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="property">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value || "—"}</strong>
    </div>
  );
}

export function MetaItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`meta-item ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function CopyButton({
  value,
  onCopy,
}: {
  value: string;
  onCopy: (value: string) => void;
}) {
  return (
    <button
      className="copy-button"
      title="复制"
      onClick={(event) => {
        event.stopPropagation();
        onCopy(value);
      }}
    >
      <Clipboard size={13} />
    </button>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <div className="empty-mark">
        <Database size={20} />
      </div>
      <h3>{title}</h3>
      <p>从左侧选择一个对象查看详情。</p>
    </div>
  );
}
