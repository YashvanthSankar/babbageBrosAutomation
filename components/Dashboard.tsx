"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { apiGet } from "./api";
import { initials } from "./helpers";
import type { DashboardResponse } from "./types";
import AdminDashboard from "./AdminDashboard";
import StudentDashboard from "./StudentDashboard";
import { Alert, Spinner } from "./ui";

/**
 * Demo mode is intentionally loud: any nonempty password is accepted by the
 * server-side credentials provider, and every record is synthetic. Roles
 * (professor/admin vs student) are decided by the server from the account
 * email, never by a client-side toggle.
 */
const DEMO_WARNING = "Demo mode: any nonempty password; synthetic records only.";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    setLoading(true);
    setError(null);
    apiGet<DashboardResponse>("/api/dashboard").then((result) => {
      if (!active) return;
      if (result.ok && result.data && result.data.role) {
        setData(result.data);
        setError(null);
      } else {
        setData(null);
        setError(result.error ?? "The dashboard endpoint returned an unexpected response.");
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [status, reloadKey]);

  if (status === "loading") {
    return (
      <div className="center-screen">
        <div className="loading-panel">
          <Spinner large />
          <div>Checking your session…</div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated" || !session) {
    return <Landing />;
  }

  const user = session.user;
  const roleLabel = data?.role === "admin" ? "Professor / Admin" : data?.role === "student" ? "Student" : "Signed in";

  return (
    <div className="app-shell">
      <header className="appbar">
        <div className="container appbar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden>
              SS
            </div>
            <div className="brand-text">
              <span className="brand-title">Student Success</span>
              <span className="brand-sub">Attendance · Marks · Advising</span>
            </div>
          </div>
          <div className="spacer" />
          <div className="appbar-actions">
            <span className={`badge ${data?.role === "admin" ? "badge-accent" : "badge-ok"}`}>
              <span className="dot" aria-hidden />
              {roleLabel}
            </span>
            <div className="user-chip" title={user?.email ?? undefined}>
              {user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar" src={user.image} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="avatar avatar-fallback" aria-hidden>
                  {initials(user?.name ?? user?.email)}
                </span>
              )}
              <span className="user-meta">
                <span className="user-email">{user?.email}</span>
              </span>
            </div>
            <button className="btn btn-sm" onClick={() => signOut()} type="button">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="demo-banner" role="note">
        <div className="container">
          <strong>{DEMO_WARNING}</strong>{" "}
          Attendance, marks and appointments in one place.
        </div>
      </div>

      <main className="container" style={{ paddingTop: 26, paddingBottom: 40 }}>
        {loading && !data ? (
          <div className="loading-panel" style={{ padding: "80px 0" }}>
            <Spinner large />
            <div>Loading your dashboard…</div>
          </div>
        ) : error ? (
          <div style={{ maxWidth: 640, margin: "40px auto 0" }}>
            <Alert tone="error" title="We couldn’t load your dashboard">
              <p>{error}</p>
              <p className="small muted" style={{ marginTop: 6 }}>
                This usually means the database or API route is not available yet. Nothing is shown
                as live until the server responds.
              </p>
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn btn-primary btn-sm" onClick={refresh} type="button">
                  Try again
                </button>
                <button className="btn btn-sm" onClick={() => signOut()} type="button">
                  Sign out
                </button>
              </div>
            </Alert>
          </div>
        ) : data?.role === "admin" ? (
          <AdminDashboard data={data} onChanged={refresh} />
        ) : data?.role === "student" ? (
          <StudentDashboard data={data} />
        ) : (
          <Alert tone="warn" title="No dashboard data">
            The server responded, but did not return a recognized role. Please contact the
            administrator.
          </Alert>
        )}
      </main>

      <footer className="footer">
        <div className="container row-between">
          <span>
            Demo session scoped to the professor’s roster. Students never see other students’
            records; all data is synthetic.
          </span>
          <span>IIITDM · Student Success</span>
        </div>
      </footer>
    </div>
  );
}

function Landing() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    if (!cleanEmail.endsWith("@iiitdm.ac.in")) {
      setError("Use your @iiitdm.ac.in email address.");
      return;
    }
    if (!name.trim() || !password || !normalizedPhone) {
      setError("Enter your name, institute email, phone number, and password.");
      return;
    }
    if (!/^\+91[6-9]\d{9}$/.test(normalizedPhone)) {
      setError("Use an Indian phone number in E.164 format, for example +919876543210.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      // The role (professor/admin vs student) is resolved server-side from the
      // account; this client sends only credentials, never a role.
      const result = await signIn("demo-credentials", {
        email: cleanEmail,
        password,
        name: name.trim(),
        phone: normalizedPhone,
        redirect: false,
      });
      if (!result) {
        setError("Sign-in could not start. Please try again.");
        return;
      }
      if (result.error) {
        setError(credentialsErrorMessage(result.error));
        return;
      }
      // Success: SessionProvider refreshes and this component is replaced by
      // the authenticated app shell.
    } catch {
      setError("Sign-in failed unexpectedly. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="appbar">
        <div className="container appbar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden>
              SS
            </div>
            <div className="brand-text">
              <span className="brand-title">Student Success</span>
              <span className="brand-sub">Attendance · Marks · Advising</span>
            </div>
          </div>
          <div className="spacer" />
          <span className="badge badge-warn">
            <span className="dot" aria-hidden />
            Demo mode
          </span>
        </div>
      </header>

      <main className="container">
        <div className="hero">
          <div className="hero-grid">
            <div>
              <span className="eyebrow">Demo access</span>
              <h1>
                Keep every student
                <br />
                on track.
              </h1>
              <p className="hero-lead">
                One dashboard for the professor to import rosters, attendance, and marks — and for
                each student to see their own attendance, scores, recovery plan, and book an
                appointment slot. Use your institute email to open your dashboard.
              </p>

              <ul className="feature-list">
                <li className="feature">
                  <span className="feature-icon" aria-hidden>
                    ✓
                  </span>
                  <span>
                    <strong>Roster-first imports.</strong> Roster, then attendance and marks — with
                    row-level errors.
                  </span>
                </li>
                <li className="feature">
                  <span className="feature-icon" aria-hidden>
                    ✓
                  </span>
                  <span>
                    <strong>Computed risk.</strong> Attendance percentage and recovery classes,
                    never guessed.
                  </span>
                </li>
                <li className="feature">
                  <span className="feature-icon" aria-hidden>
                    ✓
                  </span>
                  <span>
                    <strong>Private by design.</strong> Students see only their own records.
                  </span>
                </li>
              </ul>
            </div>

            <div className="hero-panel">
              <div className="row-between">
                <div className="card-title">Sign in</div>
                <span className="badge badge-warn">Demo</span>
              </div>

              <div style={{ marginTop: 14 }}>
                <Alert tone="warn" title="Demo mode">
                  <p>
                    <strong>{DEMO_WARNING}</strong>
                  </p>
                  <p className="small" style={{ marginTop: 6 }}>
                    Every record shown here is synthetic demo data — no real student information is
                    loaded.
                  </p>
                </Alert>
              </div>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label className="field-label" htmlFor="demo-name">
                    Full name
                  </label>
                  <input
                    id="demo-name"
                    className="input"
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={pending}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="demo-email">
                    Institute email
                  </label>
                  <input
                    id="demo-email"
                    className="input"
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="you@iiitdm.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={pending}
                    required
                  />
                  <span className="field-hint">Only @iiitdm.ac.in addresses are accepted.</span>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="demo-phone">
                    Phone number
                  </label>
                  <input
                    id="demo-phone"
                    className="input"
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+919876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={pending}
                    required
                  />
                  <span className="field-hint">Use +91 followed by a 10-digit mobile number.</span>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="demo-password">
                    Password
                  </label>
                  <input
                    id="demo-password"
                    className="input"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="any nonempty password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={pending}
                    required
                  />
                  <span className="field-hint">Demo mode accepts any nonempty password.</span>
                </div>

                {error ? (
                  <Alert tone="error" title="Sign-in failed">
                    {error}
                  </Alert>
                ) : null}

                <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
                  {pending ? <Spinner /> : null}
                  {pending ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <hr className="divider" style={{ margin: "18px 0" }} />

              <div className="card-title">Appointment scheduling</div>
              <p className="small muted" style={{ marginTop: 6 }}>
                Choose an available appointment slot after signing in. Each confirmed appointment is
                recorded against the selected subject and protected from double booking.
              </p>

              <div className="mini-table">
                <div className="mini-row">
                  <span>
                    <strong>Professor</strong>
                    <div className="small muted">Roster, imports, risk table, appointments</div>
                  </span>
                  <span className="badge badge-accent">Admin</span>
                </div>
                <div className="mini-row">
                  <span>
                    <strong>Student</strong>
                    <div className="small muted">Attendance, marks, appointments</div>
                  </span>
                  <span className="badge badge-ok">Roster</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          Demo sign-in accepts any nonempty password and shows synthetic records only. The server
          assigns the role from the account email. Appointment slots are shown only when returned by
          the service.
        </div>
      </footer>
    </div>
  );
}

function credentialsErrorMessage(code: string): string {
  switch (code) {
    case "CredentialsSignin":
      return "Those credentials were not accepted. In demo mode use any nonempty password, with an email that matches a demo account (a roster student or the configured professor address).";
    case "AccessDenied":
      return "That account is not authorized. Students must be present in the roster; the professor must use the configured professor email.";
    case "Configuration":
      return "Authentication is not configured on the server (check NEXTAUTH_SECRET and the credentials provider).";
    default:
      return `Sign-in failed (${code}). Please try again.`;
  }
}
