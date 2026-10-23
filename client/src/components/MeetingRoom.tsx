import { useCallback, useEffect, useRef, useState } from "react";
import {
  ControlBar,
  DisconnectButton,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useTrackRefContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, DisconnectReason, Track } from "livekit-client";
import "@livekit/components-styles";
import { copyText } from "../lib/copyText";

type MeetingRoomProps = {
  title: string;
  meetingId: string;
  joinLink: string;
  token: string;
  serverUrl: string;
  audio: boolean;
  video: boolean;
  displayName: string;
  inviteInitiallyOpen?: boolean;
  onLeave: () => void;
};

const REACTION_TOPIC = "atrium.reaction";
const REACTION_LIFETIME_MS = 4_400;
const MAX_ACTIVE_REACTIONS = 12;

const REACTIONS = [
  { key: "rocket", emoji: "🚀", label: "Rocket" },
  { key: "laugh", emoji: "😂", label: "Laugh" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "applause", emoji: "👏", label: "Applause" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate" },
  { key: "brilliant", emoji: "💡", label: "Brilliant" },
] as const;

type ReactionKey = (typeof REACTIONS)[number]["key"];
type ShareLayout = "focus" | "split";
type FloatingReaction = {
  id: number;
  key: ReactionKey;
  participantIdentity: string;
  slot: number;
};

function mediaDevicesUnavailable(): boolean {
  return !window.isSecureContext || typeof navigator.mediaDevices?.getUserMedia !== "function";
}

export function MeetingRoom(props: MeetingRoomProps) {
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(
    mediaDevicesUnavailable()
      ? "The browser blocked the camera and microphone. Open the https:// Wi-Fi link, not an http:// address."
      : null,
  );
  const captureMedia = !mediaDevicesUnavailable();

  return (
    <LiveKitRoom
      token={props.token}
      serverUrl={props.serverUrl}
      connect
      audio={props.audio && captureMedia}
      video={props.video && captureMedia}
      data-lk-theme="default"
      className="livekit-root"
      onDisconnected={(reason) => {
        if (reason === DisconnectReason.CLIENT_INITIATED) {
          props.onLeave();
          return;
        }
        if (reason !== undefined) {
          setMediaError("The media server closed the connection. No video call is in progress.");
        }
      }}
      onError={(error) => setMediaError(error.message)}
      onMediaDeviceFailure={() => {
        setDeviceMessage("The camera or microphone could not be opened.");
      }}
    >
      <RoomView
        title={props.title}
        meetingId={props.meetingId}
        joinLink={props.joinLink}
        displayName={props.displayName}
        inviteInitiallyOpen={props.inviteInitiallyOpen}
        mediaError={mediaError}
        deviceMessage={deviceMessage}
        onLeave={props.onLeave}
      />
    </LiveKitRoom>
  );
}

type RoomViewProps = {
  title: string;
  meetingId: string;
  joinLink: string;
  displayName: string;
  inviteInitiallyOpen?: boolean;
  mediaError: string | null;
  deviceMessage: string | null;
  onLeave: () => void;
};

function RoomView({
  title,
  meetingId,
  joinLink,
  displayName,
  inviteInitiallyOpen = false,
  mediaError,
  deviceMessage,
  onLeave,
}: RoomViewProps) {
  const connection = useConnectionState();
  const connected = connection === ConnectionState.Connected;
  const [slow, setSlow] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(inviteInitiallyOpen);
  const [copied, setCopied] = useState<"link" | "details" | null>(null);
  const [shareLayout, setShareLayout] = useState<ShareLayout>("focus");
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const reactionSequence = useRef(0);
  const reactionTimers = useRef<number[]>([]);
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const hasScreenShare = tracks.some((track) => track.source === Track.Source.ScreenShare);
  const cameraTrackCount = tracks.filter((track) => track.source === Track.Source.Camera).length;

  const showReaction = useCallback((key: ReactionKey, participantIdentity: string) => {
    reactionSequence.current += 1;
    const id = reactionSequence.current;
    const reaction = { id, key, participantIdentity, slot: id % 3 };
    setFloatingReactions((current) => [...current.slice(-(MAX_ACTIVE_REACTIONS - 1)), reaction]);

    const timer = window.setTimeout(() => {
      setFloatingReactions((current) => current.filter((item) => item.id !== id));
      reactionTimers.current = reactionTimers.current.filter((timerId) => timerId !== timer);
    }, REACTION_LIFETIME_MS);
    reactionTimers.current.push(timer);
  }, []);

  const receiveReaction = useCallback(
    (message: { payload: Uint8Array; from?: { identity: string } }) => {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(message.payload)) as { reaction?: unknown };
        const participantIdentity = message.from?.identity;
        if (isReactionKey(parsed.reaction) && isParticipantIdentity(participantIdentity)) {
          showReaction(parsed.reaction, participantIdentity);
        }
      } catch {
        // Ignore malformed or unrelated data rather than interrupting the meeting.
      }
    },
    [showReaction],
  );

  const { send: sendReactionData, isSending: isSendingReaction } = useDataChannel(
    REACTION_TOPIC,
    receiveReaction,
  );

  const sendReaction = useCallback(
    async (key: ReactionKey) => {
      showReaction(key, localParticipant.identity);
      const payload = new TextEncoder().encode(JSON.stringify({ reaction: key }));
      try {
        await sendReactionData(payload, { reliable: false });
      } catch {
        // The local animation still gives feedback if the data channel disconnects mid-send.
      }
    },
    [localParticipant.identity, sendReactionData, showReaction],
  );

  useEffect(() => {
    if (connected) {
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [connected]);

  useEffect(() => {
    return () => {
      reactionTimers.current.forEach((timer) => window.clearTimeout(timer));
      reactionTimers.current = [];
    };
  }, []);

  const status = connected
    ? "Connected to LiveKit."
    : mediaError
      ? "Not connected. No video call is in progress."
      : slow
        ? "Still not connected. No video call is in progress."
        : "Connecting to LiveKit…";

  const statusLabel = connected ? "Connected" : mediaError || slow ? "Offline" : "Connecting";

  return (
    <section className="room">
      <header className="room-bar">
        <div className="room-identity">
          <span className="room-brand" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7h11v10H4zM15 10l5-3v10l-5-3" /></svg>
          </span>
          <div className="room-heading">
            <div className="room-title-row">
              <span className="room-product">Atrium</span>
              <span className="room-divider" aria-hidden="true" />
              <h1>{title}</h1>
            </div>
            <p className="room-id">ID: {meetingId}</p>
          </div>
        </div>
        <div className="room-actions">
          <span className={`connection-pill ${connected ? "connected" : "pending"}`} role="status">
            <span aria-hidden="true" />
            {statusLabel}
          </span>
          <button
            type="button"
            className="room-copy-button"
            aria-label="Open meeting invitation"
            aria-haspopup="dialog"
            aria-expanded={inviteOpen}
            onClick={() => {
              setCopied(null);
              setInviteOpen(true);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 15 15 9M7.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" />
            </svg>
            <span>Invite</span>
          </button>
          {!connected ? (
            <button type="button" className="room-back-button" onClick={onLeave}>
              Back
            </button>
          ) : null}
        </div>
      </header>

      {connected && inviteOpen ? (
        <aside className="invite-dialog" role="dialog" aria-labelledby="invite-dialog-title">
          <div className="invite-dialog-heading">
            <div>
              <p className="invite-kicker">Room created</p>
              <h2 id="invite-dialog-title">Your meeting is ready</h2>
            </div>
            <button
              type="button"
              className="invite-close"
              aria-label="Close invitation"
              onClick={() => setInviteOpen(false)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <p className="invite-description">Share this joining information with anyone you want in the meeting.</p>
          <div className="invite-link-row">
            <span>{joinLink}</span>
            <button
              type="button"
              aria-label={copied === "link" ? "Meeting link copied" : "Copy meeting link"}
              title={copied === "link" ? "Copied" : "Copy link"}
              onClick={() => {
                void copyText(joinLink).then((didCopy) => setCopied(didCopy ? "link" : null));
              }}
            >
              {copied === "link" ? (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="4" width="11" height="14" rx="2" /><path d="M16 20H6a2 2 0 0 1-2-2V8" /></svg>
              )}
            </button>
          </div>
          <dl className="invite-details">
            <div><dt>Meeting</dt><dd>{title}</dd></div>
            <div><dt>Meeting ID</dt><dd>{meetingId}</dd></div>
          </dl>
          <button
            type="button"
            className="invite-copy-details"
            onClick={() => {
              const details = `${title}\nMeeting ID: ${meetingId}\nJoin: ${joinLink}`;
              void copyText(details).then((didCopy) => setCopied(didCopy ? "details" : null));
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="4" width="11" height="14" rx="2" /><path d="M16 20H6a2 2 0 0 1-2-2V8" /></svg>
            <span>{copied === "details" ? "Joining info copied" : "Copy joining info"}</span>
          </button>
          <p className="invite-joined-as">Joined as <strong>{displayName}</strong></p>
        </aside>
      ) : null}

      {mediaError || deviceMessage ? (
        <div className="room-notices">
          {mediaError ? (
            <p className="room-notice error" role="alert">
              <span aria-hidden="true">!</span>
              {mediaError}
            </p>
          ) : null}
          {deviceMessage ? (
            <p className="room-notice" role="status">
              <span aria-hidden="true">i</span>
              {deviceMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="stage">
        {connected ? (
          <>
            {hasScreenShare ? (
              <div className="share-layout-switcher" role="group" aria-label="Shared screen size">
                <button
                  type="button"
                  className={shareLayout === "focus" ? "active" : ""}
                  aria-pressed={shareLayout === "focus"}
                  onClick={() => setShareLayout("focus")}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
                  </svg>
                  <span>Full screen</span>
                </button>
                <button
                  type="button"
                  className={shareLayout === "split" ? "active" : ""}
                  aria-pressed={shareLayout === "split"}
                  onClick={() => setShareLayout("split")}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M12 4v16" />
                  </svg>
                  <span>Split view</span>
                </button>
              </div>
            ) : null}
            <GridLayout
              tracks={tracks}
              className={hasScreenShare ? `has-screen-share share-layout-${shareLayout}` : undefined}
              style={
                hasScreenShare && shareLayout === "split"
                  ? { gridTemplateRows: `repeat(${Math.max(cameraTrackCount, 1)}, minmax(0, 1fr))` }
                  : undefined
              }
            >
              <ParticipantTileWithReactions reactions={floatingReactions} />
            </GridLayout>
          </>
        ) : (
          <div className="waiting">
            <span className="waiting-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <div>
              <h2>{mediaError || slow ? "We couldn't connect" : "Preparing your room"}</h2>
              <p>{status}</p>
            </div>
          </div>
        )}
      </div>

      {connected ? (
        <>
          <div className="room-controls" aria-label="Meeting controls">
            <ControlBar
              variation="minimal"
              controls={{
                microphone: true,
                camera: true,
                screenShare: !mediaDevicesUnavailable(),
                chat: false,
                leave: false,
              }}
            />
            <ReactionControl onReact={sendReaction} disabled={isSendingReaction} />
          </div>
          <DisconnectButton className="room-exit-button" aria-label="Leave meeting">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5.4 15.4c4.3-3 8.9-3 13.2 0l-2 3.1-3.2-1.7v-2a10.5 10.5 0 0 0-2.8 0v2l-3.2 1.7-2-3.1Z" />
            </svg>
          </DisconnectButton>
        </>
      ) : null}
      <RoomAudioRenderer />
    </section>
  );
}

function ParticipantTileWithReactions({ reactions }: { reactions: FloatingReaction[] }) {
  const trackReference = useTrackRefContext();
  const participantReactions =
    trackReference.source === Track.Source.Camera
      ? reactions.filter(
          (reaction) => reaction.participantIdentity === trackReference.participant.identity,
        )
      : [];

  return (
    <div
      className={`participant-tile-shell ${
        trackReference.source === Track.Source.ScreenShare ? "screen-share-tile" : "camera-tile"
      }`}
    >
      <ParticipantTile />
      <div className="participant-reaction-layer" aria-live="polite" aria-atomic="false">
        {participantReactions.map((reaction) => {
          const definition = REACTIONS.find((item) => item.key === reaction.key);
          if (!definition) {
            return null;
          }
          return (
            <span
              key={reaction.id}
              className={`floating-reaction reaction-${reaction.key} reaction-slot-${reaction.slot}`}
              role="img"
              aria-label={`${trackReference.participant.name || "Participant"} reacted with ${definition.label}`}
            >
              <span className="reaction-emoji">{definition.emoji}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

type ReactionControlProps = {
  onReact: (key: ReactionKey) => Promise<void>;
  disabled: boolean;
};

function ReactionControl({ onReact, disabled }: ReactionControlProps) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closePicker(event: PointerEvent) {
      if (!controlRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="reaction-control" ref={controlRef}>
      {open ? (
        <div className="reaction-picker" role="dialog" aria-label="Meeting reactions">
          <p>Send a reaction</p>
          <div className="reaction-grid">
            {REACTIONS.map((reaction) => (
              <button
                key={reaction.key}
                type="button"
                aria-label={reaction.label}
                title={reaction.label}
                onClick={() => {
                  setOpen(false);
                  void onReact(reaction.key);
                }}
              >
                <span aria-hidden="true">{reaction.emoji}</span>
                <small>{reaction.label}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="reaction-trigger"
        aria-label="Open meeting reactions"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">✨</span>
        <small>React</small>
      </button>
    </div>
  );
}

function isReactionKey(value: unknown): value is ReactionKey {
  return typeof value === "string" && REACTIONS.some((reaction) => reaction.key === value);
}

function isParticipantIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
