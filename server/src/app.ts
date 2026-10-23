import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import type { Db } from "mongodb";
import { ZodError } from "zod";
import { livekitUnavailableMessage, type AppConfig } from "./config.js";
import { createParticipantToken } from "./livekit.js";
import { addParticipant, createMeeting, getMeeting, isMeetingId } from "./meetings.js";
import { createMeetingSchema, joinMeetingSchema } from "./validation.js";

export function createApp(db: Db, config: AppConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedClientOrigin(origin, config.clientOrigin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, livekit: config.livekit.state, appOrigin: config.appOrigin });
  });

  app.post("/api/meetings", async (req, res, next) => {
    try {
      const body = createMeetingSchema.parse(req.body);
      const meeting = await createMeeting(db, body);
      res.status(201).json({
        meeting,
        joinPath: `/m/${meeting.id}`,
        joinUrl: `${config.appOrigin}/m/${meeting.id}`,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/meetings/:meetingId", async (req, res, next) => {
    try {
      const meetingId = req.params.meetingId;
      if (!isMeetingId(meetingId)) {
        res.status(404).json(meetingNotFound());
        return;
      }
      const meeting = await getMeeting(db, meetingId);
      if (!meeting) {
        res.status(404).json(meetingNotFound());
        return;
      }
      res.json({ meeting });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/meetings/:meetingId/join", async (req, res, next) => {
    try {
      const meetingId = req.params.meetingId;
      if (!isMeetingId(meetingId)) {
        res.status(404).json(meetingNotFound());
        return;
      }
      const existing = await getMeeting(db, meetingId);
      if (!existing) {
        res.status(404).json(meetingNotFound());
        return;
      }
      const body = joinMeetingSchema.parse(req.body);
      if (config.livekit.state !== "ready") {
        res.status(503).json({
          error: {
            code: "media_not_configured",
            message: livekitUnavailableMessage(config.livekit.state),
          },
        });
        return;
      }

      const joined = await addParticipant(db, meetingId, body.displayName);
      if (!joined) {
        res.status(404).json(meetingNotFound());
        return;
      }

      const token = await createParticipantToken(config.livekit, {
        identity: joined.participant.id,
        displayName: joined.participant.displayName,
        roomName: joined.meeting.id,
      });

      res.json({
        meeting: joined.meeting,
        participant: joined.participant,
        token,
        serverUrl: config.livekit.url,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(errorHandler);
  return app;
}

function isAllowedClientOrigin(origin: string, configuredOrigin: string): boolean {
  if (origin === configuredOrigin) {
    return true;
  }
  try {
    const requestOrigin = new URL(origin);
    const expected = new URL(configuredOrigin);
    return requestOrigin.port === expected.port;
  } catch {
    return false;
  }
}

function meetingNotFound() {
  return { error: { code: "meeting_not_found", message: "Meeting not found." } };
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: error.issues[0]?.message ?? "Invalid request.",
      },
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      error: { code: "invalid_json", message: "Request body must be JSON." },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong." },
  });
};
