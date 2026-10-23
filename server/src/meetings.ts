import { ObjectId, type Db } from "mongodb";
import { MEETING_ID_PATTERN } from "../../shared/meetingId.js";
import { createMeetingId } from "./ids.js";

export type MeetingResponse = {
  id: string;
  title: string;
  hostDisplayName: string;
  createdAt: string;
};

export type ParticipantResponse = {
  id: string;
  displayName: string;
};

type MeetingDocument = {
  publicId: string;
  title: string;
  hostUserId: ObjectId;
  hostDisplayName: string;
  createdAt: Date;
  participantUserIds: ObjectId[];
};

type UserDocument = {
  displayName: string;
  createdAt: Date;
};

export function isMeetingId(value: string): boolean {
  return MEETING_ID_PATTERN.test(value);
}

export async function createMeeting(
  db: Db,
  input: { displayName: string; title: string },
): Promise<MeetingResponse> {
  const host = await insertUser(db, input.displayName);
  const title = input.title.trim();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicId = createMeetingId();
    try {
      await db.collection<MeetingDocument>("meetings").insertOne({
        publicId,
        title,
        hostUserId: host.id,
        hostDisplayName: host.displayName,
        createdAt: host.createdAt,
        participantUserIds: [host.id],
      });
      return toResponse({
        publicId,
        title,
        hostDisplayName: host.displayName,
        createdAt: host.createdAt,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
    }
  }

  throw new Error("Could not allocate a meeting id.");
}

export async function getMeeting(db: Db, publicId: string): Promise<MeetingResponse | null> {
  const meeting = await db.collection<MeetingDocument>("meetings").findOne({ publicId });
  if (!meeting) {
    return null;
  }
  return toResponse(meeting);
}

export async function addParticipant(
  db: Db,
  publicId: string,
  displayName: string,
): Promise<{ meeting: MeetingResponse; participant: ParticipantResponse } | null> {
  const existing = await db.collection<MeetingDocument>("meetings").findOne({ publicId });
  if (!existing) {
    return null;
  }

  const user = await insertUser(db, displayName);
  await db.collection<MeetingDocument>("meetings").updateOne(
    { publicId },
    { $push: { participantUserIds: user.id } },
  );

  return {
    meeting: toResponse(existing),
    participant: { id: user.id.toHexString(), displayName: user.displayName },
  };
}

async function insertUser(db: Db, displayName: string): Promise<UserDocument & { id: ObjectId }> {
  const createdAt = new Date();
  const result = await db.collection<UserDocument>("users").insertOne({ displayName, createdAt });
  return { id: result.insertedId, displayName, createdAt };
}

function toResponse(meeting: Pick<MeetingDocument, "publicId" | "title" | "hostDisplayName" | "createdAt">): MeetingResponse {
  return {
    id: meeting.publicId,
    title: meeting.title,
    hostDisplayName: meeting.hostDisplayName,
    createdAt: meeting.createdAt.toISOString(),
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
