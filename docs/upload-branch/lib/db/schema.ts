import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type ValidationItem = {
  row?: number;
  column?: string;
  code: string;
  message: string;
};

export type ValidationReport = {
  errors: ValidationItem[];
  warnings: ValidationItem[];
  summary: Record<string, number>;
};

export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    rollNumber: text("roll_number").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("students_teacher_roll_unique").on(table.teacherId, table.rollNumber),
    index("students_teacher_idx").on(table.teacherId),
  ],
);

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    threshold: integer("threshold").notNull().default(85),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("subjects_teacher_name_unique").on(table.teacherId, table.name),
    index("subjects_teacher_idx").on(table.teacherId),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    type: text("type", { enum: ["roster", "attendance"] }).notNull(),
    filename: text("filename").notNull(),
    checksum: text("checksum").notNull(),
    status: text("status", { enum: ["pending", "processing", "confirmed", "expired"] })
      .notNull()
      .default("pending"),
    parsedPayload: jsonb("parsed_payload").notNull(),
    validationReport: jsonb("validation_report").$type<ValidationReport>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [index("imports_teacher_status_idx").on(table.teacherId, table.status)],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date", { mode: "string" }).notNull(),
    status: text("status", { enum: ["P", "A"] }).notNull(),
    sourceImportId: uuid("source_import_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_student_subject_date_unique").on(
      table.studentId,
      table.subjectId,
      table.attendanceDate,
    ),
    index("attendance_subject_date_idx").on(table.subjectId, table.attendanceDate),
  ],
);
