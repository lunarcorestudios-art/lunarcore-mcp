import { z } from "zod";

import {
  CLIENT_STATUSES,
  DOC_KINDS,
  ENTITY_KINDS,
  LEAD_STAGES,
  MILESTONE_STATUSES,
  PROJECT_STATUSES,
  PROPOSAL_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../types/entities.js";

export const limitField = z
  .number()
  .int()
  .min(1)
  .max(200)
  .optional()
  .describe("Page size. Default 50, maximum 200.");

export const idField = z.string().trim().min(1).max(80).describe("Record id.");
export const nameField = z.string().trim().min(1).max(200);
export const textField = z.string().trim().min(1).max(8_000);
export const bodyField = z.string().trim().min(1).max(100_000).describe("Document body.");
export const dayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Calendar date, YYYY-MM-DD.");
export const dateTimeField = z.string().datetime({ offset: true }).describe("ISO-8601 datetime.");
export const queryField = z.string().trim().min(1).max(200).describe("Case-insensitive text query.");

export const contactField = z
  .object({
    name: z.string().trim().min(1).max(200).optional().describe("Contact name."),
    email: z.string().trim().email().optional().describe("Contact email."),
  })
  .optional()
  .describe("Primary contact. Provide a name, an email, or both.");

export const clientStatusField = z.enum(CLIENT_STATUSES);
export const projectStatusField = z.enum(PROJECT_STATUSES);
export const milestoneStatusField = z.enum(MILESTONE_STATUSES);
export const taskStatusField = z.enum(TASK_STATUSES);
export const taskPriorityField = z.enum(TASK_PRIORITIES);
export const leadStageField = z.enum(LEAD_STAGES);
export const proposalStatusField = z.enum(PROPOSAL_STATUSES);
export const docKindField = z.enum(DOC_KINDS);
export const entityKindField = z.enum(ENTITY_KINDS);
