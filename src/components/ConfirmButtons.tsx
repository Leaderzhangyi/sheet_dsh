import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";

export function ConfirmIconButton({
  label,
  onConfirm,
  size = 14,
}: {
  label: string;
  onConfirm: () => void;
  size?: number;
}) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 2800);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return (
    <button
      type="button"
      className={`icon-button danger row-delete ${pending ? "confirming" : ""}`}
      aria-label={pending ? `再点一次确认：${label}` : label}
      title={pending ? "再点一次确认删除" : label}
      onClick={(event) => {
        event.stopPropagation();
        if (pending) {
          setPending(false);
          onConfirm();
        } else {
          setPending(true);
        }
      }}
    >
      {pending ? <Check size={size} /> : <Trash2 size={size} />}
    </button>
  );
}

export function ConfirmTextButton({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => void;
}) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 2800);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return (
    <button
      type="button"
      className={`danger-button ${pending ? "confirming" : ""}`}
      onClick={() => {
        if (pending) {
          setPending(false);
          onConfirm();
        } else {
          setPending(true);
        }
      }}
    >
      <Trash2 size={15} />
      {pending ? "再点一次，确认删除" : label}
    </button>
  );
}
