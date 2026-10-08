"use client";

import { useState } from "react";
import { apiGet, apiPostJson } from "./api";
import { subjectLabel } from "./helpers";
import type { BookingResponse, CalendarSlot, SlotsResponse, SubjectStat } from "./types";
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner } from "./ui";

function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function BookingPanel({
  subjects,
  subjectId,
  onSubjectChange,
}: {
  subjects: SubjectStat[];
  subjectId: string;
  onSubjectChange: (id: string) => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<CalendarSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [calendarMeta, setCalendarMeta] = useState<{
    connected: boolean;
    source?: string;
    warning?: string;
  } | null>(null);
  const [selected, setSelected] = useState<CalendarSlot | null>(null);
  const [booking, setBooking] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResponse["booking"] | null>(null);

  function resetSlots() {
    setSlots(null);
    setSlotsError(null);
    setCalendarMeta(null);
    setSelected(null);
    setBooking("idle");
    setBookingError(null);
    setBookingResult(null);
  }

  async function loadSlots() {
    if (!subjectId) {
      setSlotsError("Choose a subject first.");
      return;
    }
    setLoading(true);
    setSlotsError(null);
    setSelected(null);
    setBooking("idle");
    setBookingResult(null);

    const url = `/api/calendar/slots?subjectId=${encodeURIComponent(subjectId)}&date=${encodeURIComponent(date)}`;
    const res = await apiGet<SlotsResponse>(url);
    setLoading(false);

    if (!res.ok) {
      setSlots(null);
      setCalendarMeta(null);
      setSlotsError(res.error ?? "Could not load availability.");
      return;
    }
    setSlots(res.data?.slots ?? []);
    setCalendarMeta({
      connected: Boolean(res.data?.calendarConnected),
      source: res.data?.source,
      warning: res.data?.warning,
    });
  }

  async function confirmBooking() {
    if (!selected || !subjectId) return;
    setBooking("saving");
    setBookingError(null);

    const res = await apiPostJson<BookingResponse>("/api/calendar/book", {
      subjectId,
      start: selected.start,
      end: selected.end,
    });

    if (!res.ok || !res.data?.booking) {
      setBooking("error");
      setBookingError(res.error ?? "The booking could not be created.");
      return;
    }
    setBookingResult(res.data.booking);
    setBooking("done");
  }

  return (
    <Card padded={false}>
      <CardHeader
        title="Book an advising slot"
        subtitle="Availability comes from the professor’s Google Calendar when connected; otherwise it reflects local demo bookings only. Slots are 20–30 minutes."
        actions={<Badge tone="accent">/api/calendar</Badge>}
      />
      <div className="card-body stack" style={{ gap: 16 }}>
        {subjects.length === 0 ? (
          <EmptyState icon="📅" title="Booking unavailable">
            No subjects are available on your record yet, so there is nothing to book against.
          </EmptyState>
        ) : (
          <>
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="booking-subject">
                  Subject
                </label>
                <select
                  id="booking-subject"
                  className="select"
                  value={subjectId}
                  onChange={(e) => {
                    onSubjectChange(e.target.value);
                    resetSlots();
                  }}
                >
                  <option value="">Select a subject…</option>
                  {subjects.map((subject) => (
                    <option key={String(subject.id)} value={String(subject.id)}>
                      {subjectLabel(subject)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="booking-date">
                  Date
                </label>
                <input
                  id="booking-date"
                  className="input"
                  type="date"
                  value={date}
                  min={todayIso()}
                  onChange={(e) => {
                    setDate(e.target.value);
                    resetSlots();
                  }}
                />
              </div>
            </div>

            <div className="row wrap">
              <button
                className="btn btn-primary"
                onClick={loadSlots}
                disabled={loading || !subjectId}
                type="button"
              >
                {loading ? <Spinner /> : null}
                {loading ? "Checking…" : "Check availability"}
              </button>
              {slots && slots.length > 0 ? (
                <span className="small muted">
                  {slots.filter((s) => s.available).length} of {slots.length} slots open on{" "}
                  {formatDay(date)}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="loading-panel" style={{ padding: "20px 0" }}>
                <Spinner />
                <span className="small">Querying the professor’s calendar…</span>
              </div>
            ) : null}

            {slotsError ? (
              <Alert tone="error" title="Availability unavailable">
                <p>{slotsError}</p>
                <p className="small" style={{ marginTop: 6 }}>
                  If Google Calendar is not connected for the professor, no slots can be shown. This
                  is reported honestly rather than faked.
                </p>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn-sm" onClick={loadSlots} type="button">
                    Retry
                  </button>
                </div>
              </Alert>
            ) : null}

            {calendarMeta && !loading ? (
              <Alert
                tone={calendarMeta.connected ? "info" : "warn"}
                title={calendarMeta.connected ? "Google Calendar connected" : "Limited availability"}
              >
                {calendarMeta.warning ??
                  (calendarMeta.connected
                    ? "Availability reflects the professor’s live Google Calendar."
                    : "The professor has not connected Google Calendar, so availability is based only on bookings made in this app.")}
              </Alert>
            ) : null}

            {slots && !loading ? (
              slots.length === 0 ? (
                <EmptyState icon="🗓" title="No slots for this date">
                  The professor has no free time on {formatDay(date)}. Try another day.
                </EmptyState>
              ) : (
                <div className="slot-list">
                  {slots.map((slot) => (
                    <button
                      key={`${slot.start}-${slot.end}`}
                      className={`slot ${selected?.start === slot.start ? "selected" : ""}`}
                      disabled={!slot.available}
                      onClick={() => setSelected(slot)}
                      type="button"
                      aria-pressed={selected?.start === slot.start}
                    >
                      <span className="slot-time">
                        {formatTime(slot.start)} – {formatTime(slot.end)}
                      </span>
                      <span className="slot-sub">
                        {slot.available ? "Available" : "Not available"}
                      </span>
                    </button>
                  ))}
                </div>
              )
            ) : null}

            {selected ? (
              <div className="row wrap" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <span className="small">
                  Selected: <strong>{formatDay(selected.start)}</strong>,{" "}
                  {formatTime(selected.start)}–{formatTime(selected.end)}
                </span>
                <span className="spacer" />
                <button
                  className="btn btn-primary"
                  onClick={confirmBooking}
                  disabled={booking === "saving"}
                  type="button"
                >
                  {booking === "saving" ? <Spinner /> : null}
                  {booking === "saving" ? "Booking…" : "Confirm booking"}
                </button>
              </div>
            ) : null}

            {booking === "done" && bookingResult ? (
              <Alert tone="ok" title="Booking confirmed">
                Your slot on {formatDay(bookingResult.start ?? selected?.start ?? "")} at{" "}
                {formatTime(bookingResult.start ?? selected?.start ?? "")} is booked.
                {bookingResult.status ? ` Status: ${bookingResult.status}.` : ""}
                {bookingResult.id ? (
                  <>
                    {" "}
                    <span className="mono">#{bookingResult.id}</span>
                  </>
                ) : null}
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn-sm" onClick={loadSlots} type="button">
                    Refresh availability
                  </button>
                </div>
              </Alert>
            ) : null}

            {booking === "error" ? (
              <Alert tone="error" title="Booking failed">
                {bookingError}
              </Alert>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
