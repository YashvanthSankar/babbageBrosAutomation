"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { apiGet } from "./api";
import { initials } from "./helpers";
import type { DashboardResponse } from "./types";
import AdminDashboard from "./AdminDashboard";
import StudentDashboard from "./StudentDashboard";
import { Alert, Spinner } from "./ui";
import Icon from "./Icon";

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
    <div className={`app-shell ${data?.role === "admin" ? "faculty-shell" : ""}`}>
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
          Attendance · Assessments · Student support
        </div>
      </div>

      <main className={`container ${data?.role === "admin" ? "dashboard-main" : ""}`} style={{ paddingTop: 26, paddingBottom: 40 }}>
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

  function prefillDemo(kind: "student" | "professor") {
    setName(kind === "student" ? "Narendhar" : "Professor");
    setEmail(kind === "student" ? "ec24b1053@iiitdm.ac.in" : "professor@iiitdm.ac.in");
    setPhone(randomDemoPhone());
    setPassword("meow");
    setError(null);
  }

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
    <div className="welcome-shell">
      <header className="welcome-header">
        <a href="/" className="welcome-brand" aria-label="Student Success home"><span className="welcome-mark"><Icon name="book" size={22} /></span><span>Student Success<span className="welcome-brand-sub">Babbage Bros</span></span></a>
        <span className="welcome-event">CS Week 2026 <span>Education track</span></span>
      </header>
      <main className="welcome-main">
        <section className="welcome-story" aria-labelledby="welcome-title">
          <span className="welcome-eyebrow"><span /> A little clarity. Better outcomes.</span>
          <h1 id="welcome-title">See the signs.<br />Support the student.</h1>
          <p className="welcome-lead">Attendance, assessment results, and the next step — together in one calm workspace.</p>
          <div className="welcome-preview" aria-label="Illustrative student recovery plan">
            <div className="welcome-preview-head"><span><Icon name="chart" size={18} /> A clearer path forward</span><span className="welcome-example">Example</span></div>
            <div className="welcome-preview-body"><div><span className="welcome-caption">Attendance</span><strong>80<span>%</span></strong><span className="welcome-target">85% required</span></div><div className="welcome-recovery"><span className="welcome-caption">Recovery plan</span><strong>7 more classes</strong><span>Attend consecutively to get back on track.</span></div></div>
            <div className="welcome-track" aria-hidden="true"><span /></div>
            <div className="welcome-preview-foot"><Icon name="check" size={16} /> A practical next step for every student.</div>
          </div>
          <div className="welcome-features">
            <div><Icon name="upload" size={20} /><strong>Import once.</strong><p>Upload attendance and marks with a preview before confirming.</p></div>
            <div><Icon name="alert" size={20} /><strong>Find who needs help.</strong><p>See attendance concerns and weak or falling results first.</p></div>
            <div><Icon name="clock" size={20} /><strong>Make time to talk.</strong><p>Students can book an available advising appointment.</p></div>
          </div>
        </section>
        <section className="welcome-signin" aria-labelledby="signin-title">
          <span className="welcome-caption">YOUR WORKSPACE</span>
          <h2 id="signin-title">Welcome in.</h2>
          <p className="welcome-signin-intro">Sign in with your institute email to continue.</p>
          <div className="welcome-demo-note"><strong>Competition demo</strong><span>Use synthetic records only. Any nonempty password is accepted.</span></div>
          <div className="welcome-shortcuts" aria-label="Demo account shortcuts"><button type="button" disabled={pending} onClick={() => prefillDemo("professor")}><Icon name="grid" size={18} /> Try professor <Icon name="arrow" size={16} /></button><button type="button" disabled={pending} onClick={() => prefillDemo("student")}><Icon name="users" size={18} /> Try student <Icon name="arrow" size={16} /></button></div>
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
          <p className="welcome-role-note"><Icon name="check" size={15} /> Your account determines your view. Students see their own records.</p>
        </section>
      </main>
      <footer className="welcome-footer"><span>Student Success · Built for CS Week</span><span>Attendance. Progress. A conversation.</span></footer>
    </div>
  );
}

function randomDemoPhone(): string {
  const randomDigit = (max: number) => {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  return `+91${6 + randomDigit(4)}${Array.from({ length: 9 }, () => randomDigit(10)).join("")}`;
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
