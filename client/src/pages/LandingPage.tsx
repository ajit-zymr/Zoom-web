import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, createMeeting } from "../api";
import { MediaStatus } from "../components/MediaStatus";
import { parseMeetingId } from "../../../shared/meetingId";

type MeetingTab = "create" | "join";
const COPYRIGHT_YEAR = new Date().getFullYear();

export function LandingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MeetingTab>("create");
  const [hostName, setHostName] = useState("");
  const [title, setTitle] = useState("");
  const [joinValue, setJoinValue] = useState("");
  const [guestName, setGuestName] = useState("");
  const [audio, setAudio] = useState(true);
  const [video, setVideo] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setTitleError(null);
    const meetingTitle = title.trim();
    if (!meetingTitle) {
      setTitleError("Meeting title is required.");
      return;
    }
    setCreating(true);
    try {
      const result = await createMeeting({ displayName: hostName, title: meetingTitle });
      navigate(`/m/${result.meeting.id}`, {
        state: {
          displayName: hostName.trim(),
          audio,
          video,
          autoJoin: true,
          showInvite: true,
        },
      });
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

  return (
    <div className="page landing-page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Atrium home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>Atrium</span>
        </a>
        <p className="topbar-note">
          <span aria-hidden="true" />
          Private rooms, right in your browser
        </p>
      </header>
      <main className="landing landing-shell">
        <section className="hero" aria-labelledby="landing-title">
          <div className="hero-badge">
            <span className="hero-badge-icon" aria-hidden="true">✦</span>
            Video meetings made simple
          </div>
          <h1 id="landing-title">Meet face-to-face, from anywhere.</h1>
          <p className="lede">
            Start a room in seconds and invite anyone with a link. No account setup, no complicated steps—just a space to talk.
          </p>
          <div className="hero-points" aria-label="Meeting benefits">
            <div className="hero-point">
              <span className="point-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m7 12 3 3 7-7" /></svg>
              </span>
              No downloads
            </div>
            <div className="hero-point">
              <span className="point-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
              </span>
              Secure by design
            </div>
            <div className="hero-point">
              <span className="point-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 12h16M12 4v16" /></svg>
              </span>
              One-click invites
            </div>
          </div>

          <div className="meeting-preview" aria-hidden="true">
            <div className="preview-person preview-person-main">
              <div className="preview-avatar avatar-one">AM</div>
              <span>Avery</span>
              <div className="voice-bars"><i /><i /><i /><i /></div>
            </div>
            <div className="preview-person preview-person-small">
              <div className="preview-avatar avatar-two">JL</div>
              <span>Jordan</span>
            </div>
            <div className="preview-controls">
              <span><svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" /></svg></span>
              <span><svg viewBox="0 0 24 24"><path d="M15 10 21 7v10l-6-3v-4ZM3 6h12v12H3z" /></svg></span>
              <span className="preview-end"><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg></span>
            </div>
          </div>
        </section>

        <section className="meeting-panel" aria-label="Meeting actions">
          <div className="meeting-panel-heading">
            <p className="eyebrow">Get started</p>
            <h2>{activeTab === "create" ? "Create your room" : "Join a room"}</h2>
            <p>
              {activeTab === "create"
                ? "Set up a meeting and share the invite with your people."
                : "Enter the meeting details from your invitation."}
            </p>
          </div>

          <div className="meeting-tabs" role="tablist" aria-label="Choose a meeting action">
            <button
              type="button"
              role="tab"
              id="create-tab"
              aria-controls="create-panel"
              aria-selected={activeTab === "create"}
              className={activeTab === "create" ? "active" : ""}
              onClick={() => setActiveTab("create")}
            >
              <span className="tab-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 7h10v10H4zM14 10l6-3v10l-6-3" /></svg>
              </span>
              New meeting
            </button>
            <button
              type="button"
              role="tab"
              id="join-tab"
              aria-controls="join-panel"
              aria-selected={activeTab === "join"}
              className={activeTab === "join" ? "active" : ""}
              onClick={() => setActiveTab("join")}
            >
              <span className="tab-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M13 5h6v14h-6M10 8l4 4-4 4M14 12H3" /></svg>
              </span>
              Join meeting
            </button>
          </div>

          <div
            className="tab-panel"
            id="create-panel"
            role="tabpanel"
            aria-labelledby="create-tab"
            hidden={activeTab !== "create"}
          >
            <form className="meeting-form" onSubmit={(event) => void onCreate(event)}>
                <div className="form-field">
                  <label htmlFor="host-name">Your display name</label>
                  <input
                    id="host-name"
                    name="displayName"
                    autoComplete="nickname"
                    maxLength={40}
                    required
                    placeholder="How others will see you"
                    value={hostName}
                    onChange={(event) => {
                      setHostName(event.target.value);
                      setCreateError(null);
                    }}
                  />
                </div>
                <div className="form-field">
                  <div className="label-row">
                    <label htmlFor="meeting-title">Meeting title</label>
                    <span>Required</span>
                  </div>
                  <input
                    id="meeting-title"
                    name="title"
                    maxLength={80}
                    required
                    aria-invalid={Boolean(titleError)}
                    aria-describedby={titleError ? "meeting-title-error" : undefined}
                    placeholder="e.g. Weekly catch-up"
                    value={title}
                    onInvalid={(event) => {
                      event.preventDefault();
                      setTitleError("Meeting title is required.");
                    }}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setTitleError(null);
                      setCreateError(null);
                    }}
                  />
                  {titleError ? (
                    <p className="field-error" id="meeting-title-error" role="alert">
                      {titleError}
                    </p>
                  ) : null}
                </div>
                <fieldset className="device-options">
                  <legend>Start with</legend>
                  <div className="device-grid">
                    <label className="device-option">
                      <span className="device-option-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" /></svg>
                      </span>
                      <span>Microphone</span>
                      <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
                      <span className="toggle" aria-hidden="true" />
                    </label>
                    <label className="device-option">
                      <span className="device-option-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M15 10 21 7v10l-6-3v-4ZM3 6h12v12H3z" /></svg>
                      </span>
                      <span>Camera</span>
                      <input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} />
                      <span className="toggle" aria-hidden="true" />
                    </label>
                  </div>
                </fieldset>
                {createError ? <p className="form-error" role="alert">{createError}</p> : null}
                <button className="primary-action" type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Create meeting"}
                </button>
              <p className="form-footnote">You’ll enter the meeting as soon as the room is ready.</p>
            </form>
          </div>

          <div
            className="tab-panel"
            id="join-panel"
            role="tabpanel"
            aria-labelledby="join-tab"
            hidden={activeTab !== "join"}
          >
            <form className="meeting-form" onSubmit={onJoin}>
              <div className="form-field">
                <label htmlFor="join-value">Meeting ID or invite link</label>
                <input
                  id="join-value"
                  name="meeting"
                  required
                  placeholder="Paste a meeting link or ID"
                  value={joinValue}
                  onChange={(event) => {
                    setJoinValue(event.target.value);
                    setJoinError(null);
                  }}
                />
              </div>
              <div className="form-field">
                <label htmlFor="guest-name">Your display name</label>
                <input
                  id="guest-name"
                  name="displayName"
                  autoComplete="nickname"
                  maxLength={40}
                  required
                  placeholder="How others will see you"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </div>
              <fieldset className="device-options">
                <legend>Join with</legend>
                <div className="device-grid">
                  <label className="device-option">
                    <span className="device-option-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" /></svg>
                    </span>
                    <span>Microphone</span>
                    <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
                    <span className="toggle" aria-hidden="true" />
                  </label>
                  <label className="device-option">
                    <span className="device-option-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M15 10 21 7v10l-6-3v-4ZM3 6h12v12H3z" /></svg>
                    </span>
                    <span>Camera</span>
                    <input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} />
                    <span className="toggle" aria-hidden="true" />
                  </label>
                </div>
              </fieldset>
              {joinError ? <p className="form-error" role="alert">{joinError}</p> : null}
              <button className="primary-action" type="submit">Continue to meeting</button>
              <p className="form-footnote">Check your camera and microphone before you enter.</p>
            </form>
          </div>

          <div className="panel-status">
            <MediaStatus />
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <span>© {COPYRIGHT_YEAR} Atrium</span>
        <span>Simple, secure browser meetings</span>
      </footer>
    </div>
  );
}
