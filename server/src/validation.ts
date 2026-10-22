import { z } from "zod";

const displayNameSchema = z
  .string({ required_error: "Enter a display name.", invalid_type_error: "Enter a display name." })
  .trim()
  .min(1, "Enter a display name.")
  .max(40, "Use 40 characters or fewer for the display name.");

export const createMeetingSchema = z.object({
  displayName: displayNameSchema,
  title: z
    .string({ required_error: "Enter a meeting title.", invalid_type_error: "Enter a meeting title." })
    .trim()
    .min(1, "Enter a meeting title.")
    .max(80, "Use 80 characters or fewer for the title."),
});

export const joinMeetingSchema = z.object({
  displayName: displayNameSchema,
});
