import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, getMeeting, joinMeeting, meetingLink, type JoinSession, type Meeting } from "../api";
import { MeetingRoom } from "../components/MeetingRoom";
import { MediaStatus } from "../components/MediaStatus";

type JoinLocationState = {
  displayName?: string;
  audio?: boolean;
  video?: boolean;
};

export function MeetingPage() {
  const { meetingId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = (location.state ?? null) as JoinLocationState | null;
  const [loaded, setLoaded] = useState<{ meetingId: string; meeting: Meeting | null; error: string | null } | null>(null);
  const [displayName, setDisplayName] = useState(incoming?.displayName ?? "");
  const [audio, setAudio] = useState(incoming?.audio ?? true);
  const [video, setVideo] = useState(incoming?.video ?? true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [session, setSession] = useState<JoinSession | null>(null);

  useEffect(() => {
    let active = true;
    getMeeting(meetingId)
      .then((next) => {
        if (active) {
          setLoaded({ meetingId, meeting: next, error: null });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoaded({
            meetingId,
            meeting: null,
            error: error instanceof ApiError ? error.message : "Meeting not found.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [meetingId]);

  const loading = loaded?.meetingId !== meetingId;
  const meeting = loaded?.meetingId === meetingId ? loaded.meeting : null;
  const loadError = loaded?.meetingId === meetingId ? loaded.error : null;

  async function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError(null);
    setJoining(true);
    try {
      const next = await joinMeeting(meetingId, displayName);
      setSession(next);
    } catch (error) {
      setJoinError(error instanceof ApiError ? error.message : "Could not join the meeting.");
    } finally {
      setJoining(false);
    }
  }

  if (session && meeting) {
    return (
      <MeetingRoom
        title={meeting.title}
        meetingId={meeting.id}
        joinLink={meetingLink(meeting.id)}
        token={session.token}
        serverUrl={session.serverUrl}
        audio={audio}
        video={video}
        onLeave={() => navigate("/")}
      />
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link className="brand" to="/">
          Atrium
        </Link>
      </header>
      <main className="lobby">
        {loading ? <p className="status-banner checking">Loading meeting…</p> : null}
        {loadError ? (
          <section className="card narrow">
            <h1>Meeting unavailable</h1>
            <p>{loadError}</p>
            <Link to="/">Back to the start</Link>
          </section>
        ) : null}
        {meeting ? (
          <section className="card narrow">
            <p className="eyebrow">Join meeting</p>
            <h1>{meeting.title}</h1>
            <p className="room-id">Meeting ID {meeting.id}</p>
            <p className="share-preview">{meetingLink(meeting.id)}</p>
            <MediaStatus />
            <form onSubmit={(event) => void onJoin(event)}>
              <label htmlFor="lobby-name">Display name</label>
              <input
                id="lobby-name"
                name="displayName"
                autoComplete="nickname"
                maxLength={40}
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <fieldset>
                <legend>Start with</legend>
                <label className="check">
                  <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
                  Microphone
                </label>
                <label className="check">
                  <input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} />
                  Camera
                </label>
              </fieldset>
              {joinError ? (
                <div className="form-error" role="alert">
                  <p>{joinError}</p>
                  {joinErrorIncludesUnavailable(joinError) ? <p>No video call was started.</p> : null}
                </div>
              ) : null}
              <button type="submit" disabled={joining}>
                {joining ? "Joining…" : "Join meeting"}
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function joinErrorIncludesUnavailable(message: string): boolean {
  return message.toLowerCase().includes("no access token");
}
