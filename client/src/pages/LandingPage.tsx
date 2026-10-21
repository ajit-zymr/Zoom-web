import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, createMeeting, meetingLink, type Meeting } from "../api";
import { MediaStatus } from "../components/MediaStatus";
import { copyText } from "../lib/copyText";
import { parseMeetingId } from "../../../shared/meetingId";

type CreatedMeeting = {
  meeting: Meeting;
  link: string;
};

export function LandingPage() {
  const navigate = useNavigate();
  const [hostName, setHostName] = useState("");
  const [title, setTitle] = useState("");
  const [joinValue, setJoinValue] = useState("");
  const [guestName, setGuestName] = useState("");
  const [audio, setAudio] = useState(true);
  const [video, setVideo] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedMeeting | null>(null);
  const [copied, setCopied] = useState(false);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const result = await createMeeting({ displayName: hostName, title });
      setCreated({ meeting: result.meeting, link: result.joinUrl || meetingLink(result.meeting.id) });
      setCopied(false);
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : "Could not create the meeting.");
    } finally {
      setCreating(false);
    }
  }

  function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const meetingId = parseMeetingId(joinValue);
    if (!meetingId) {
      setJoinError("Enter a meeting ID or a full meeting link.");
      return;
    }
    if (guestName.trim().length === 0) {
      setJoinError("Enter a display name.");
      return;
    }
    navigate(`/m/${meetingId}`, {
      state: { displayName: guestName.trim(), audio, video },
    });
  }

  async function onCopy() {
    if (!created) {
      return;
    }
    setCopied(await copyText(created.link));
  }

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="/">
          Atrium
        </a>
      </header>
      <main className="landing">
        <section className="hero">
          <p className="eyebrow">Browser meetings</p>
          <h1>Open a room, share the link, and talk.</h1>
          <p className="lede">
            Create a meeting, join with your name, and use your microphone and camera when the media server is connected.
          </p>
          <MediaStatus />
        </section>

        <div className="panels">
          <section className="card">
            <h2>New meeting</h2>
            {created ? (
              <div className="created">
                <p className="created-title">{created.meeting.title}</p>
                <label htmlFor="share-link">Shareable link</label>
                <div className="share-row">
                  <input id="share-link" readOnly value={created.link} />
                  <button type="button" className="secondary" onClick={() => void onCopy()}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/m/${created.meeting.id}`, {
                        state: { displayName: hostName.trim(), audio, video },
                      })
                    }
                  >
                    Join this meeting
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setCreated(null);
                      setTitle("");
                    }}
                  >
                    Create another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={(event) => void onCreate(event)}>
                <label htmlFor="host-name">Display name</label>
                <input
                  id="host-name"
                  name="displayName"
                  autoComplete="nickname"
                  maxLength={40}
                  required
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                />
                <label htmlFor="meeting-title">Title, optional</label>
                <input
                  id="meeting-title"
                  name="title"
                  maxLength={80}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                {createError ? <p className="form-error">{createError}</p> : null}
                <button type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Create meeting"}
                </button>
              </form>
            )}
          </section>

          <section className="card">
            <h2>Join a meeting</h2>
            <form onSubmit={onJoin}>
              <label htmlFor="join-value">Meeting ID or link</label>
              <input
                id="join-value"
                name="meeting"
                required
                value={joinValue}
                onChange={(event) => {
                  setJoinValue(event.target.value);
                  setJoinError(null);
                }}
              />
              <label htmlFor="guest-name">Display name</label>
              <input
                id="guest-name"
                name="displayName"
                autoComplete="nickname"
                maxLength={40}
                required
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
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
              {joinError ? <p className="form-error">{joinError}</p> : null}
              <button type="submit">Continue</button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
