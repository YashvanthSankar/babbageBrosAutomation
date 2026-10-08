# Product specification

## Goal

Give a faculty member a reliable backend workflow to import a class roster and subject attendance sheets, identify students below or near an attendance requirement, and calculate how many consecutive classes an at-risk student must attend to recover.

## Current MVP scope

- A public competition-demo session representing one teacher.
- One class roster per teacher workspace.
- Multiple subjects, each with a configurable integer threshold from 1–99; the default is 85.
- Roster and attendance `.xlsx` preview with structured errors and warnings.
- No domain records are changed during preview.
- Atomic confirmation of a valid, unexpired preview.
- Re-upload corrections through a unique student/subject/date attendance key.
- Student creation, editing, activation, and deactivation.
- Subject creation and editing.
- Subject dashboard data sorted by risk.

The app root contains only a backend status message. A full teacher-facing frontend is not part of the current deliverable.

## Risk rules

For `present` attended classes and `recorded` total classes:

- Percentage is `(present / recorded) × 100`. A student with no records has no percentage.
- **At Risk:** percentage is below the subject threshold.
- **Watch:** percentage is at least the threshold and below threshold + 5 percentage points.
- **Safe:** percentage is at least threshold + 5.
- **No Data:** no attendance is recorded for that subject.
- Recovery classes are the smallest non-negative integer `n` satisfying `(present + n) / (recorded + n) >= threshold / 100`.

Dashboard order is At Risk, Watch, Safe, then No Data. Within At Risk, lower attendance comes first; ties use the larger recovery requirement first.

## Deferred work

- Production login, accounts, password recovery, and role-based authorization.
- A teacher dashboard frontend.
- Multiple departments, cohorts, semesters, or sections.
- Marks ingestion and falling-mark analysis.
- AI-generated explanations or warnings.
- Email, calls, weekly summaries, timetable sync, and appointment booking.
- Original workbook binary retention and import rollback.
