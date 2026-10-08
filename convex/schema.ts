import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teachers: defineTable({
    name: v.string(),
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  students: defineTable({
    teacherId: v.id("teachers"),
    rollNumber: v.string(),
    normalizedRoll: v.string(),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teacher", ["teacherId"])
    .index("by_teacher_roll", ["teacherId", "normalizedRoll"]),

  subjects: defineTable({
    teacherId: v.id("teachers"),
    name: v.string(),
    normalizedName: v.string(),
    code: v.optional(v.string()),
    attendanceThreshold: v.number(),
    marksThreshold: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teacher", ["teacherId"])
    .index("by_teacher_name", ["teacherId", "normalizedName"]),

  importBatches: defineTable({
    teacherId: v.id("teachers"),
    subjectId: v.optional(v.id("subjects")),
    type: v.union(v.literal("roster"), v.literal("attendance"), v.literal("marks")),
    filename: v.string(),
    checksum: v.string(),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("confirmed"), v.literal("expired")),
    parsedPayload: v.any(),
    validationReport: v.any(),
    expiresAt: v.number(),
    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
  }).index("by_teacher_status", ["teacherId", "status"]),

  attendanceRecords: defineTable({
    studentId: v.id("students"),
    subjectId: v.id("subjects"),
    attendanceDate: v.string(),
    status: v.union(v.literal("P"), v.literal("A")),
    sourceImportId: v.id("importBatches"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subject", ["subjectId"])
    .index("by_student_subject_date", ["studentId", "subjectId", "attendanceDate"]),

  assessments: defineTable({
    teacherId: v.id("teachers"),
    subjectId: v.id("subjects"),
    name: v.string(),
    normalizedName: v.string(),
    assessmentDate: v.string(),
    maxMarks: v.number(),
    sourceImportId: v.id("importBatches"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subject", ["subjectId"])
    .index("by_subject_date_name", ["subjectId", "assessmentDate", "normalizedName"]),

  marksRecords: defineTable({
    studentId: v.id("students"),
    subjectId: v.id("subjects"),
    assessmentId: v.id("assessments"),
    marksObtained: v.number(),
    percentage: v.number(),
    sourceImportId: v.id("importBatches"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subject", ["subjectId"])
    .index("by_student_subject", ["studentId", "subjectId"])
    .index("by_student_assessment", ["studentId", "assessmentId"]),
});
