import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <section className={`card ${padded ? "card-pad" : ""} ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div>
        <div className="card-title">{title}</div>
        {subtitle ? <div className="card-sub">{subtitle}</div> : null}
      </div>
      {actions ? <div className="row wrap">{actions}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "danger" | "accent";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const cls = tone === "neutral" ? "badge" : `badge badge-${tone}`;
  return <span className={cls}>{children}</span>;
}

export function Stat({
  label,
  value,
  hint,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "accent" | "ok" | "warn" | "danger";
}) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

export function Progress({ percent, tone }: { percent: number; tone?: "ok" | "warn" | "danger" }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const resolved = tone ?? (clamped < 75 ? "danger" : clamped < 85 ? "warn" : "ok");
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-bar ${resolved}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "ok" | "warn" | "error";
  title?: ReactNode;
  children?: ReactNode;
}) {
  const icon = tone === "error" ? "⚠" : tone === "warn" ? "!" : tone === "ok" ? "✓" : "ⓘ";
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : undefined}>
      <span className="alert-icon" aria-hidden>
        {icon}
      </span>
      <div>
        {title ? <div className="alert-title">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "🗂",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <div className="empty-title">{title}</div>
      {children ? <div className="small">{children}</div> : null}
    </div>
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`spinner ${large ? "spinner-lg" : ""}`} aria-hidden />;
}
