# Workbook import contracts

Only `.xlsx` files are accepted. The maximum size defaults to 1 MiB and can be changed with `MAX_UPLOAD_BYTES`. Only the first worksheet is processed. A workbook can have at most 500 data rows; attendance workbooks can have at most 370 date columns and 2,000 non-blank attendance records per upload.

## Roster workbook

The first four cells of row 1 must be exactly these normalized headings and in this order:

| A | B | C | D |
| --- | --- | --- | --- |
| `roll_number` | `name` | `email` | `phone` |

Whitespace and header capitalization are normalized, and spaces/hyphens become underscores. Example:

| roll_number | name | email | phone |
| --- | --- | --- | --- |
| CS001 | Asha Rao | asha@example.com | +91 98765 43210 |

Rules:

- All four values are required.
- Email must be syntactically valid and is saved lowercase.
- Phone accepts digits plus an optional leading `+`, spaces, parentheses, or hyphens; length is 7–24 characters.
- Roll numbers are matched case-insensitively for duplicate detection.
- Confirming a roster upserts by teacher + roll number, updates contact fields, and reactivates existing students.

Download the generated template from `GET /api/templates/roster`.

## Attendance workbook

Cell A1 must be `roll_number`. Every remaining heading is a class date represented by a native Excel date or strict `YYYY-MM-DD` text.

| roll_number | 2026-10-01 | 2026-10-02 | 2026-10-03 |
| --- | --- | --- | --- |
| CS001 | P | A | P |
| CS002 | P |  | P |

Rules:

- Values are trimmed and normalized case-insensitively to `P` or `A`.
- A blank cell means “not recorded.” It creates no record, does not affect the percentage, and produces an aggregate warning.
- Invalid dates, duplicate date columns, duplicate roll rows, invalid statuses, and unknown roll numbers are blocking errors.
- Inactive students produce a warning but can still receive imported records.
- Confirming upserts by student + subject + date, so a later confirmed upload corrects an existing value.

Download the generated template from `GET /api/templates/attendance`.

## Marks workbook

Each upload represents one assessment. The request supplies `subjectId`, `assessmentName`, `assessmentDate` in `YYYY-MM-DD`, and a positive `maxMarks` no greater than 10,000. The workbook has exactly this leading structure:

| roll_number | marks_obtained |
| --- | ---: |
| CS001 | 42 |
| CS002 | 37.5 |

Rules:

- Marks may be integers or decimals from zero through `maxMarks`.
- Blank marks mean “not recorded,” are skipped, and produce an aggregate warning.
- Duplicate roll numbers, unknown students, non-numeric marks, and out-of-range marks are blocking errors.
- Inactive students produce a warning but can still receive marks.
- Re-uploading the same subject, assessment date, and case-insensitive assessment name corrects existing results rather than creating a duplicate assessment.

Download the generated template from `GET /api/templates/marks`.

## Preview lifecycle

Preview responses contain `batchId`, `expiresAt`, `canConfirm`, `report`, and a small normalized sample. Errors block confirmation; warnings do not. Pending batches expire after 30 minutes. A confirmed, expired, or already claimed batch cannot be confirmed again.

Validation items have this shape:

```json
{
  "row": 3,
  "column": "C",
  "code": "INVALID_STATUS",
  "message": "Expected A or P, received \"late\"."
}
```

The report stores at most 250 errors and 250 warnings, while summary counts still describe the parsed workbook.
