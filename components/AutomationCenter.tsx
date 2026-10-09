"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPostJson } from "./api";
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner } from "./ui";

type ProviderState = {
  configured: boolean;
  testRecipientConfigured?: boolean;
  liveAllowed: boolean;
};

type AutomationStatus = {
  database: "connected" | "unavailable" | string;
  mode: "simulation" | "live" | string;
  email: ProviderState;
  voice: ProviderState;
  calendar: { connected: boolean };
  weeklySummary: { cronConfigured: boolean; liveSummaryAllowed: boolean; liveAdviserAllowed: boolean; adviserConfigured: boolean };
};

type ActivityEvent = {
  id: string;
  provider: string;
  status: string;
  createdAt: number;
  sentAt: number | null;
  studentName: string;
  subjectName: string;
};

const ROSTER_CSV = [
  "studentname,rollno,phone,email",
  "Sample Student,DEMO-001,+919000000001,demo.student@iiitdm.ac.in",
].join("\n");

const ATTENDANCE_CSV = [
  "rollno,2026-09-01,2026-09-02,2026-09-03,2026-09-04,2026-09-07,2026-09-08,2026-09-09,2026-09-10,2026-09-11,2026-09-14,2026-09-15,2026-09-16,2026-09-17,2026-09-18,2026-09-21,2026-09-22,2026-09-23,2026-09-24,2026-09-25,2026-09-28",
  "DEMO-001,P,P,P,A,P,P,A,P,P,P,P,A,P,P,P,P,P,A,P,P",
].join("\n");

const MARKS_CSV = [
  "rollno,subject,test_name,test_date,score,max_score",
  "DEMO-001,CS101,Quiz 1,2026-09-16,72,100",
  "DEMO-001,CS101,Midterm,2026-09-28,42,100",
].join("\n");

function downloadCsv(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function providerLabel(provider: string): string {
  if (provider === "weekly_summary") return "Weekly cohort summary";
  if (provider === "adviser_alert") return "Faculty adviser alert";
  if (provider === "manual_demo_email") return "Manual attendance email";
  if (provider === "manual_demo_voice") return "Manual attendance call";
  if (provider.includes("omnidim")) return "Voice call · OmniDimension";
  if (provider.includes("resend")) return "Warning email · Resend";
  return provider;
}

function statusLabel(status: string): { label: string; tone: "ok" | "warn" | "danger" | "accent" } {
  if (status === "dispatched") return { label: "Accepted by provider", tone: "ok" };
  if (status === "simulated") return { label: "Simulated · not sent", tone: "accent" };
  if (status === "failed") return { label: "Failed", tone: "danger" };
  if (status === "pending") return { label: "In progress", tone: "warn" };
  return { label: status, tone: "warn" };
}

function timeLabel(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default function AutomationCenter({
  onOpenImports,
  hasStudents,
  hasSubjects,
}: {
  onOpenImports: () => void;
  hasStudents: boolean;
  hasSubjects: boolean;
}) {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningWeekly, setRunningWeekly] = useState(false);
  const [weeklyMessage, setWeeklyMessage] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const [statusResult, activityResult] = await Promise.all([
      apiGet<AutomationStatus>("/api/automation/status"),
      apiGet<{ events: ActivityEvent[] }>("/api/automation/activity"),
    ]);
    setStatus(statusResult.ok ? statusResult.data ?? null : null);
    if (activityResult.ok && activityResult.data) setEvents(activityResult.data.events ?? []);
    const failures = [statusResult, activityResult].filter((result) => !result.ok);
    setError(failures.length ? failures[0].error ?? "Could not load automation status." : null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function runWeekly() {
    setRunningWeekly(true);
    const result = await apiPostJson<{week:string;counts:{totalStudents:number;atRiskStudents:number};results:Record<string,string>}>("/api/automation/weekly", {});
    setRunningWeekly(false);
    setWeeklyMessage(result.ok && result.data ? `${result.data.week}: ${result.data.counts.atRiskStudents} of ${result.data.counts.totalStudents} students at risk. Summary: ${result.data.results.weekly_summary}; adviser: ${result.data.results.adviser_alert}.` : result.error ?? "Could not run summary.");
    if (result.ok) void refresh(true);
  }

  return (
    <div className="stack automation-center" style={{ gap: 18 }}>
      {error ? <Alert tone="warn" title="Automation status unavailable">{error}</Alert> : null}

      <div className="automation-intro">
        <div>
          <span className="eyebrow">Delivery settings and activity</span>
          <h2>Email and call activity</h2>
          <p>See import warnings, manual examples and weekly summaries. Check whether each action was simulated or accepted by a provider.</p>
        </div>
        <button className="btn" type="button" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? <Spinner /> : null}{refreshing ? "Refreshing…" : "Refresh status"}
        </button>
      </div>

      <div className="automation-mode-banner">
        <span className="automation-mode-mark" aria-hidden>{status?.mode === "live" ? "LIVE" : status?.mode === "simulation" ? "SAFE" : "?"}</span>
        <div>
          <strong>{status?.mode === "live" ? "Live delivery is enabled" : status?.mode === "simulation" ? "Outbound delivery is off" : "Delivery mode unavailable"}</strong>
          <p>
            {status?.mode === "live"
              ? "Import-triggered delivery uses approved server contacts. Manual sends to entered contacts also require separate server approval, professor Google sign-in and recipient consent."
              : status?.mode === "simulation" ? "Imports still run risk rules and create activity records. No real email or phone call is sent."
              : "We could not confirm whether email or calls are enabled. Check the status above or refresh."}
          </p>
        </div>
      </div>

      <div className="automation-provider-grid">
        <ProviderCard
          title="Risk engine"
          provider="Attendance + marks"
          ready={status?.database === "connected"}
          loading={loading}
          detail={status?.database === "connected" ? "Connected to the shared student records." : "Waiting for the application database."}
          value={status?.database === "connected" ? "Ready" : "Unavailable"}
        />
        <ProviderCard
          title="Warning emails"
          provider="Resend"
          loading={loading}
          ready={Boolean(status?.email.liveAllowed)}
          value={status?.email.liveAllowed ? "Test inbox enabled" : status?.mode === "live" ? "Setup incomplete" : status?.mode === "simulation" ? "Simulated" : "Unknown"}
          detail={status?.email.liveAllowed
              ? "Import a risk result to send one privacy-safe test message today to the pinned inbox."
            : status?.mode === "live"
              ? "Add Resend credentials, a verified sender, and a pinned test inbox."
              : status?.mode !== "simulation" ? "Email delivery status could not be confirmed."
              : status.email.configured
                ? "Credentials are present, but sending is intentionally disabled in public demo mode."
                : "No outbound message is sent. The risk and notification flow is still recorded."}
        />
        <ProviderCard
          title="Attendance calls"
          provider="OmniDimension"
          loading={loading}
          ready={Boolean(status?.voice.liveAllowed)}
          value={status?.voice.liveAllowed ? "Test number enabled" : status?.mode === "live" ? "Setup incomplete" : status?.mode === "simulation" ? "Simulated" : "Unknown"}
          detail={status?.voice.liveAllowed
              ? "The first newly-below-threshold transition today calls only the consented test number, using synthetic facts."
            : status?.mode === "live"
              ? "Add OmniDimension credentials and a pinned, consenting test phone."
              : status?.mode !== "simulation" ? "Call delivery status could not be confirmed."
              : status.voice.configured
                ? "Credentials are present, but calling is intentionally disabled in public demo mode."
                : "No phone call is placed. Threshold transitions appear in the activity log."}
        />
        <ProviderCard
          title="Appointments"
          provider="Professor availability"
          loading={loading}
          ready={Boolean(status?.calendar.connected)}
          value={status?.calendar.connected ? "Google Calendar connected" : "In-app booking"}
          detail={status?.calendar.connected
            ? "Bookings can check availability and create professor calendar events."
            : "Students can still book collision-checked in-app slots; Google sync needs professor consent."}
        />
        <ProviderCard
          title="Weekly summary"
          provider="Scheduled digest"
          loading={loading}
          ready={Boolean(status?.weeklySummary.cronConfigured)}
          value={status?.weeklySummary.cronConfigured ? "Cron secret configured" : "Manual run available"}
          detail="Counts only, no student names. One run per week; public mode simulates email. Automatic scheduling needs a separate VPS job; a configured secret does not prove it exists."
        />
      </div>

      <Card padded={false}><CardHeader title="Weekly support summary" subtitle="Run this week's summary once. If any students need support and an adviser is configured, an adviser alert is also recorded." />
        <div className="card-body stack"><button className="btn" type="button" disabled={runningWeekly} onClick={() => void runWeekly()}>{runningWeekly ? "Running…" : "Run this week's summary"}</button>
          {weeklyMessage ? <p className="small" role="status">{weeklyMessage}</p> : null}</div></Card>

      <Card padded={false}>
        <CardHeader
          title="Run the end-to-end demo"
          subtitle="Use the synthetic files to test the same roster-first workflow a professor uses."
          actions={<Badge tone="accent">No real student data</Badge>}
        />
        <div className="card-body stack" style={{ gap: 14 }}>
          <div className="automation-steps">
            <div className={`automation-step ${hasStudents ? "complete" : ""}`}><span>1</span><div><strong>Import the roster</strong><small>{hasStudents ? "Roster is present" : "Upload the sample roster first"}</small></div></div>
            <div className={`automation-step ${hasSubjects ? "complete" : ""}`}><span>2</span><div><strong>Add a subject</strong><small>{hasSubjects ? "At least one subject is ready" : "Create CS101 in Imports"}</small></div></div>
            <div className="automation-step"><span>3</span><div><strong>Import attendance &amp; marks</strong><small>Attendance is 80%; marks fall from 72% to 42%</small></div></div>
            <div className="automation-step"><span>4</span><div><strong>Check this activity feed</strong><small>See simulated or provider-accepted events</small></div></div>
          </div>
          <div className="row wrap">
            <button className="btn" onClick={() => downloadCsv("sample-roster.csv", ROSTER_CSV)} type="button">Download roster CSV</button>
            <button className="btn" onClick={() => downloadCsv("sample-attendance.csv", ATTENDANCE_CSV)} type="button">Download attendance CSV</button>
            <button className="btn" onClick={() => downloadCsv("sample-marks.csv", MARKS_CSV)} type="button">Download marks CSV</button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={onOpenImports} type="button">Open imports</button>
          </div>
          <p className="small muted">Sample identity and contact values are synthetic. Public demo mode never calls or emails uploaded contacts. Live tests use fixed demo content and approved contacts; daily limits apply separately to import-triggered and manual examples.</p>
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader
          title="Recent automation activity"
          subtitle="A provider-accepted request does not prove the email arrived or the call connected. Simulations never contact anyone."
          actions={<Badge tone={events.length ? "accent" : "neutral"}>{events.length} events</Badge>}
        />
        {loading ? (
          <div className="loading-panel" style={{ padding: 36 }}><Spinner /><span>Loading activity…</span></div>
        ) : events.length === 0 ? (
          <EmptyState title="No automation events yet">Import attendance or marks for a student at risk; the resulting actions will appear here.</EmptyState>
        ) : (
          <div className="automation-feed" role="list" aria-label="Recent automation events">
            {events.map((event) => {
              const outcome = statusLabel(event.status);
              return (
                <div className="automation-event" role="listitem" key={event.id}>
                  <span className={`automation-event-icon ${event.provider.includes("omnidim") || event.provider === "manual_demo_voice" ? "voice" : "email"}`} aria-hidden>
                    {event.provider.includes("omnidim") || event.provider === "manual_demo_voice" ? "☎" : "✉"}
                  </span>
                  <div className="automation-event-main">
                    <strong>{providerLabel(event.provider)}</strong>
                    <span>{event.provider.startsWith("manual_demo_") ? "Synthetic 69% attendance example" : `${event.studentName} · ${event.subjectName}`}</span>
                  </div>
                  <span className="automation-event-time">{timeLabel(event.sentAt ?? event.createdAt)}</span>
                  <Badge tone={outcome.tone}>{outcome.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function ProviderCard({
  title,
  provider,
  value,
  detail,
  ready,
  loading,
}: {
  title: string;
  provider: string;
  value: string;
  detail: string;
  ready: boolean;
  loading: boolean;
}) {
  return (
    <section className="automation-provider card">
      <div className="automation-provider-top">
        <div><span>{provider}</span><h3>{title}</h3></div>
        <span className={`automation-indicator ${ready ? "ready" : "limited"}`} aria-label={ready ? "Ready" : "Limited or simulated"} />
      </div>
      <div className="automation-provider-state">{loading ? <><Spinner /> Checking…</> : value}</div>
      <p>{detail}</p>
    </section>
  );
}
