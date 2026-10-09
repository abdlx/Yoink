import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

export function Brand() {
  return (
    <a className="brand" href="#downloads" aria-label="Yoink home">
      <img
        className="brand-logo"
        src="/static/branding/yoink-logo.svg"
        alt="Yoink"
        width="143"
        height="40"
      />
      <img
        className="brand-symbol"
        src="/static/branding/yoink-mark.svg"
        alt="Yoink"
        width="32"
        height="32"
      />
    </a>
  );
}
export function Modal({
  title,
  children,
  close,
  drawer = false,
  subtitle,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  drawer?: boolean;
  subtitle?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? "drawer" : "detail-dialog"}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <div className="modal-heading">
        <div>
          {subtitle && <span className="eyebrow">{subtitle}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
