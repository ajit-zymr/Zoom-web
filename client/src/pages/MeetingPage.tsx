import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, getMeeting, joinMeeting, meetingLink, type JoinSession, type Meeting } from "../api";
import { MeetingRoom } from "../components/MeetingRoom";
import { MediaStatus } from "../components/MediaStatus";

type JoinLocationState = {
  displayName?: string;
  audio?: boolean;
  video?: boolean;
  autoJoin?: boolean;
  showInvite?: boolean;
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
  const autoJoinMeeting = useRef<string | null>(null);

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

  const enterMeeting = useCallback(async () => {
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
  }, [displayName, meetingId]);

  useEffect(() => {
    if (!meeting || !incoming?.autoJoin || autoJoinMeeting.current === meetingId) {
      return;
    }
    autoJoinMeeting.current = meetingId;
    void enterMeeting();
  }, [enterMeeting, incoming?.autoJoin, meeting, meetingId]);

  function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void enterMeeting();
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
        displayName={displayName}
        inviteInitiallyOpen={Boolean(incoming?.showInvite)}
        onLeave={() => navigate("/")}
      />
    );
  }

  if (incoming?.autoJoin && !loadError && !joinError) {
    return (
      <div className="meeting-entry" role="status" aria-live="polite">
        <span className="meeting-entry-mark" aria-hidden="true"><span /><span /><span /></span>
        <h1>{loading ? "Creating your meeting" : "Joining your meeting"}</h1>
        <p>Your room will open automatically.</p>
      </div>
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
              <fieldset className="device-options">
                <legend>Start with</legend>
                <div className="device-grid">
                  <label className="device-option">
                    <span className="device-option-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />
                      </svg>
                    </span>
                    <span>Microphone</span>
                    <input
                      type="checkbox"
                      checked={audio}
                      onChange={(event) => setAudio(event.target.checked)}
                    />
                    <span className="toggle" aria-hidden="true" />
                  </label>
                  <label className="device-option">
                    <span className="device-option-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M15 10 21 7v10l-6-3v-4ZM3 6h12v12H3z" />
                      </svg>
                    </span>
                    <span>Camera</span>
                    <input
                      type="checkbox"
                      checked={video}
                      onChange={(event) => setVideo(event.target.checked)}
                    />
                    <span className="toggle" aria-hidden="true" />
                  </label>
                </div>
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
