/**
 * Zod schemas for JSON mutation endpoints (students and subjects).
 *
 * Adapted from the `upload` branch to this repository's schema: IDs are
 * integer serials, student phone is optional, and subjects carry a
 * configurable threshold plus an optional department.
 */
import { z } from 'zod';

export const studentInput = z.object({
  rollNumber: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(24)
    .regex(/^\+?[0-9 ()-]+$/, 'Enter a valid phone number')
    .optional()
    .nullable(),
});

export const studentPatch = studentInput
  .partial()
  .extend({ id: z.coerce.number().int().positive(), active: z.boolean().optional() });

export const subjectInput = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(30).optional().nullable(),
  department: z.string().trim().max(120).optional().nullable(),
  threshold: z.coerce.number().int().min(1).max(99).default(85),
});

export const subjectPatch = subjectInput.partial().extend({ id: z.coerce.number().int().positive() });
