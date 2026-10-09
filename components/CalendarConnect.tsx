"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { apiGet } from "./api";
import Icon from "./Icon";

type Connection = { professorEmail: string; googleAccountEmail: string | null; configured: boolean; connected: boolean };

export default function CalendarConnect({ professorEmail }: { professorEmail: string }) {
  const { data: session } = useSession();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiGet<Connection>("/api/calendar/connection").then((result) => {
      if (active) { setConnection(result.ok ? result.data ?? null : null); setLoading(false); }
    });
    return () => { active = false; };
  }, []);

  if (loading) return <span className="calendar-connection-status">Checking Calendar…</span>;
  if (connection?.connected && session?.user?.verifiedProfessor) return <span className="calendar-connection-status"><Icon name="check" size={15} /> Calendar connected · Professor verified</span>;

  return <>
    {connection?.connected ? <span className="calendar-connection-status"><Icon name="check" size={15} /> Calendar connected</span> : null}
    <button className="btn btn-sm" type="button" onClick={() => setOpen(true)}>{connection?.connected ? "Reconnect Calendar" : "Connect Calendar"}</button>
    {open ? <div className="calendar-dialog-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <section className="calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-dialog-title" onClick={(event) => event.stopPropagation()}>
        <button className="calendar-dialog-close" aria-label="Close Calendar information" type="button" onClick={() => setOpen(false)}>×</button>
        <span className="calendar-dialog-icon"><Icon name="clock" size={22} /></span>
        <h2 id="calendar-dialog-title">Connect the professor Google Calendar</h2>
        <p>Google will ask you to choose the approved account <strong>{connection?.googleAccountEmail || "configured by the organizer"}</strong>. Your workspace stays signed in as <strong>{connection?.professorEmail || professorEmail}</strong>.</p>
        <p>After you approve Calendar access, we’ll show free slots to students and add confirmed appointments to your calendar.</p>
        <p>Calendar connection is optional and is not required for the manual call and email tests.</p>
        {connection?.configured ? <button className="btn btn-primary" type="button" onClick={() => void signIn("google-professor", { callbackUrl: "/" })}>Continue to Google <Icon name="arrow" size={16} /></button>
          : <div className="calendar-setup-note">Calendar needs a Google OAuth Web application client ID, secret, and dedicated Google account email on the server. The project’s API key alone cannot connect a private calendar. In-app booking is available meanwhile.</div>}
      </section>
    </div> : null}
  </>;
}
