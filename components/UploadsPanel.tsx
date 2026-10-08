"use client";

import { useMemo, useRef, useState } from "react";
import { apiUpload } from "./api";
import { subjectLabel } from "./helpers";
import type { IngestResult, SubjectStat } from "./types";
import { Alert, Badge, Card, CardHeader } from "./ui";

type StepId = "roster" | "attendance" | "marks";

type StepResult =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "done"; result: IngestResult }
  | { status: "error"; error: string; result?: IngestResult };

const STEPS: {
  id: StepId;
  title: string;
  endpoint: string;
  needsSubject: boolean;
  description: string;
  columns: string;
  hint: string;
}[] = [
  {
    id: "roster",
    title: "Roster",
    endpoint: "/api/ingest/roster",
    needsSubject: false,
    description: "Import the class roster first. Every later upload matches students by roll number.",
    columns: "studentname, rollno, phone, email",
    hint: "Required columns exactly as above. Email must be the student’s verified Google address.",
  },
  {
    id: "attendance",
    title: "Attendance",
    endpoint: "/api/ingest/attendance",
    needsSubject: true,
    description: "Import attendance for one subject at a time. Blank cells are skipped.",
    columns: "rollno, 2026-01-10, 2026-01-12, …",
    hint: "Each date header must be a real class date. Values accept P/A, present/absent, or 1/0.",
  },
  {
    id: "marks",
    title: "Marks",
    endpoint: "/api/ingest/marks",
    needsSubject: true,
    description: "Import test scores. A subject can be selected here or supplied in the CSV.",
    columns: "rollno, subject, test_name, test_date, score, max_score",
    hint: "Scores are compared as percentages against the previous comparable test.",
  },
];

export default function UploadsPanel({
  subjects,
  studentsCount,
  onImported,
}: {
  subjects: SubjectStat[];
  studentsCount: number;
  onImported: () => void;
}) {
  const [active, setActive] = useState<StepId>("roster");
  const [files, setFiles] = useState<Record<StepId, File | null>>({
    roster: null,
    attendance: null,
    marks: null,
  });
  const [subjectChoice, setSubjectChoice] = useState<Record<StepId, string>>({
    roster: "",
    attendance: "",
    marks: "",
  });
  const [results, setResults] = useState<Record<StepId, StepResult>>({
    roster: { status: "idle" },
    attendance: { status: "idle" },
    marks: { status: "idle" },
  });

  const step = STEPS.find((s) => s.id === active)!;
  const rosterDone = results.roster.status === "done";

  const subjectOptions = useMemo(
    () => subjects.map((s) => ({ value: String(s.id), label: subjectLabel(s) })),
    [subjects],
  );

  async function submit(current: StepId) {
    const file = files[current];
    const config = STEPS.find((s) => s.id === current)!;
    if (!file) return;

    if (config.needsSubject && !subjectChoice[current]) {
      setResults((prev) => ({
        ...prev,
        [current]: { status: "error", error: "Select a subject before uploading." },
      }));
      return;
    }

    setResults((prev) => ({ ...prev, [current]: { status: "uploading" } }));

    const form = new FormData();
    form.append("file", file);
    if (config.needsSubject) {
      form.append("subjectId", subjectChoice[current]);
    }

    const res = await apiUpload<IngestResult>(config.endpoint, form);

    if (!res.ok) {
      setResults((prev) => ({
        ...prev,
        [current]: { status: "error", error: res.error ?? "Upload failed.", result: res.data },
      }));
      return;
    }

    const result = res.data ?? {};
    setResults((prev) => ({ ...prev, [current]: { status: "done", result } }));
    onImported();
  }

  function goTo(id: StepId) {
    setActive(id);
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="steps" role="tablist" aria-label="Import steps">
        {STEPS.map((s, index) => {
          const state = results[s.id].status;
          return (
            <button
              key={s.id}
              className={`step ${active === s.id ? "active" : ""} ${state === "done" ? "done" : ""}`}
              onClick={() => goTo(s.id)}
              role="tab"
              aria-selected={active === s.id}
              type="button"
            >
              <span className="step-num">{state === "done" ? "✓" : index + 1}</span>
              {s.title}
            </button>
          );
        })}
      </div>

      <Card padded={false}>
        <CardHeader
          title={`${step.title} import`}
          subtitle={step.description}
          actions={<Badge tone="accent">POST {step.endpoint}</Badge>}
        />
        <div className="card-body stack" style={{ gap: 16 }}>
          {active !== "roster" && !rosterDone ? (
            <Alert tone="warn" title="Roster not imported yet">
              The roster must be imported first so roll numbers can be matched. Uploads with unknown
              roll numbers will be rejected.
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn btn-sm" onClick={() => goTo("roster")} type="button">
                  Go to roster
                </button>
              </div>
            </Alert>
          ) : null}

          <div className="form-grid">
            <div className="field">
              <span className="field-label">CSV file</span>
              <FileDrop
                id={`file-${step.id}`}
                file={files[step.id]}
                onFile={(file) => setFiles((prev) => ({ ...prev, [step.id]: file }))}
              />
            </div>

            {step.needsSubject ? (
              <div className="field">
                <label className="field-label" htmlFor={`subject-${step.id}`}>
                  Subject
                </label>
                {subjectOptions.length > 0 ? (
                  <select
                    id={`subject-${step.id}`}
                    className="select"
                    value={subjectChoice[step.id]}
                    onChange={(e) =>
                      setSubjectChoice((prev) => ({ ...prev, [step.id]: e.target.value }))
                    }
                  >
                    <option value="">Select a subject…</option>
                    {subjectOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`subject-${step.id}`}
                    className="input"
                    placeholder="Subject ID (no subjects found in dashboard)"
                    value={subjectChoice[step.id]}
                    onChange={(e) =>
                      setSubjectChoice((prev) => ({ ...prev, [step.id]: e.target.value }))
                    }
                  />
                )}
                <span className="field-hint">
                  {subjectOptions.length > 0
                    ? "Subjects are derived from the imported roster/marks data."
                    : "No subjects detected yet — enter the subject ID configured on the server."}
                </span>
              </div>
            ) : (
              <div className="field">
                <span className="field-label">Required columns</span>
                <div className="mono" style={{ paddingTop: 8 }}>
                  {step.columns}
                </div>
                <span className="field-hint">{step.hint}</span>
              </div>
            )}
          </div>

          {step.needsSubject ? (
            <div className="field">
              <span className="field-label">Expected CSV columns</span>
              <span className="mono">{step.columns}</span>
              <span className="field-hint">{step.hint}</span>
            </div>
          ) : null}

          <ResultBlock state={results[step.id]} />

          <div className="row wrap">
            <button
              className="btn btn-primary"
              disabled={!files[step.id] || results[step.id].status === "uploading"}
              onClick={() => submit(step.id)}
              type="button"
            >
              {results[step.id].status === "uploading" ? "Uploading…" : `Upload ${step.title.toLowerCase()}`}
            </button>
            {active === "roster" ? (
              <button
                className="btn"
                onClick={() => goTo("attendance")}
                disabled={!rosterDone}
                type="button"
              >
                Continue to attendance →
              </button>
            ) : active === "attendance" ? (
              <button className="btn" onClick={() => goTo("marks")} type="button">
                Continue to marks →
              </button>
            ) : null}
            <span className="spacer" />
            <span className="small muted">
              {studentsCount} student{studentsCount === 1 ? "" : "s"} currently in the roster
            </span>
          </div>
        </div>
      </Card>

      <p className="small muted">
        Uploads are sent as <span className="mono">multipart/form-data</span> with the CSV in the{" "}
        <span className="mono">file</span> field and, for attendance/marks, the subject in{" "}
        <span className="mono">subjectId</span>. Errors are reported per row by the server.
      </p>
    </div>
  );
}

function ResultBlock({ state }: { state: StepResult }) {
  if (state.status === "idle") return null;
  if (state.status === "uploading") {
    return (
      <Alert tone="info" title="Uploading…">
        Sending the file to the server. Large CSVs may take a moment.
      </Alert>
    );
  }
  if (state.status === "error") {
    const rowErrors = state.result?.errors ?? [];
    return (
      <Alert tone="error" title="Upload failed">
        <p>{state.error}</p>
        {rowErrors.length > 0 ? <ErrorList errors={rowErrors} /> : null}
      </Alert>
    );
  }

  const { imported = 0, updated = 0, errors = [] } = state.result;
  return (
    <Alert tone={errors.length > 0 ? "warn" : "ok"} title={errors.length > 0 ? "Imported with issues" : "Import complete"}>
      <p>
        <strong>{imported}</strong> imported, <strong>{updated}</strong> updated
        {errors.length > 0 ? `, ${errors.length} row error${errors.length === 1 ? "" : "s"}` : ""}.
      </p>
      {errors.length > 0 ? <ErrorList errors={errors} /> : null}
    </Alert>
  );
}

function ErrorList({ errors }: { errors: { row: number | string; message: string }[] }) {
  return (
    <ul className="alert-list">
      {errors.slice(0, 50).map((err, index) => (
        <li key={`${err.row}-${index}`}>
          <span className="mono">Row {err.row}:</span> {err.message}
        </li>
      ))}
      {errors.length > 50 ? <li>…and {errors.length - 50} more.</li> : null}
    </ul>
  );
}

function FileDrop({
  id,
  file,
  onFile,
}: {
  id: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={`dropzone ${file ? "has-file" : ""} ${dragging ? "has-file" : ""}`}
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onFile(dropped);
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <div className="dropzone-icon" aria-hidden>
        {file ? "📄" : "⬆️"}
      </div>
      <div className="dropzone-title">
        {file ? "File selected" : "Choose a CSV or drag it here"}
      </div>
      {file ? (
        <div className="dropzone-file">{file.name}</div>
      ) : (
        <div className="small muted">CSV only · max size depends on server limits</div>
      )}
    </label>
  );
}
