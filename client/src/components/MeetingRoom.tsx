import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  useParticipants,
  useTrackRefContext,
  useTracks,
} from "@livekit/components-react";
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
} from "@livekit/track-processors";
import { ConnectionState, DisconnectReason, Track, type LocalVideoTrack } from "livekit-client";
import "@livekit/components-styles";
import { copyText } from "../lib/copyText";
import {
  isReactionKey,
  MEETING_REACTIONS,
  SHARE_LAYOUT,
  type ReactionKey,
  type ShareLayout,
} from "../lib/meetingRoom";

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
const CHAT_TOPIC = "atrium.chat";
const REACTION_LIFETIME_MS = 4_400;
const MAX_ACTIVE_REACTIONS = 12;
const MAX_CHAT_MESSAGE_LENGTH = 1_000;
const EVERYONE = "everyone";

type FloatingReaction = {
  id: number;
  key: ReactionKey;
  participantIdentity: string;
  slot: number;
};

type ChatMessage = {
  id: string;
  body: string;
  senderIdentity: string;
  senderName: string;
  recipientIdentity: string | null;
  recipientName: string | null;
  sentAt: number;
};

type ChatPayload = {
  id: string;
  body: string;
  recipientIdentity?: string;
  recipientName?: string;
  sentAt: number;
};

type ChatParticipant = {
  identity: string;
  name: string;
  online: boolean;
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
  const [shareLayout, setShareLayout] = useState<ShareLayout>(SHARE_LAYOUT.focus);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRecipient, setChatRecipient] = useState(EVERYONE);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatUnread, setChatUnread] = useState<Record<string, number>>({});
  const [backgroundBlurEnabled, setBackgroundBlurEnabled] = useState(false);
  const [backgroundBlurBusy, setBackgroundBlurBusy] = useState(false);
  const [backgroundBlurError, setBackgroundBlurError] = useState<string | null>(null);
  const reactionSequence = useRef(0);
  const reactionTimers = useRef<number[]>([]);
  const backgroundBlurRequest = useRef(0);
  const backgroundProcessor = useRef<{
    track: LocalVideoTrack;
    processor: BackgroundProcessorWrapper;
  } | null>(null);
  const backgroundBlurSupported = useMemo(() => supportsBackgroundProcessors(), []);
  const { cameraTrack, localParticipant } = useLocalParticipant();
  const localCameraTrack = cameraTrack?.videoTrack as LocalVideoTrack | undefined;
  const participants = useParticipants();
  const chatParticipants = useMemo<ChatParticipant[]>(
    () =>
      participants
        .filter((participant) => participant.identity !== localParticipant.identity)
        .map((participant) => ({
          identity: participant.identity,
          name: participant.name?.trim() || "Participant",
          online: true,
        }))
        .sort((first, second) => first.name.localeCompare(second.name)),
    [localParticipant.identity, participants],
  );
  const chatContacts = useMemo<ChatParticipant[]>(() => {
    const contacts = new Map(
      chatParticipants.map((participant) => [participant.identity, participant]),
    );
    chatMessages.forEach((message) => {
      if (!message.recipientIdentity) {
        return;
      }
      const identity =
        message.senderIdentity === localParticipant.identity
          ? message.recipientIdentity
          : message.senderIdentity;
      if (!contacts.has(identity)) {
        contacts.set(identity, {
          identity,
          name:
            message.senderIdentity === localParticipant.identity
              ? message.recipientName || "Participant"
              : message.senderName,
          online: false,
        });
      }
    });
    return [...contacts.values()].sort((first, second) => first.name.localeCompare(second.name));
  }, [chatMessages, chatParticipants, localParticipant.identity]);
  const activeChatRecipient =
    chatRecipient === EVERYONE ||
    chatContacts.some((participant) => participant.identity === chatRecipient)
      ? chatRecipient
      : EVERYONE;
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const hasScreenShare = tracks.some((track) => track.source === Track.Source.ScreenShare);
  const cameraTrackCount = tracks.filter((track) => track.source === Track.Source.Camera).length;

  const updateBackgroundBlur = useCallback(
    async (enabled: boolean) => {
      if (!backgroundBlurSupported) {
        setBackgroundBlurError("Background blur is not supported by this browser.");
        return;
      }
      if (!localCameraTrack) {
        if (!enabled) {
          setBackgroundBlurEnabled(false);
          setBackgroundBlurError(null);
          return;
        }
        setBackgroundBlurError("Turn on your camera before enabling background blur.");
        return;
      }

      backgroundBlurRequest.current += 1;
      const request = backgroundBlurRequest.current;
      setBackgroundBlurBusy(true);
      setBackgroundBlurError(null);

      try {
        let activeProcessor = backgroundProcessor.current;
        if (activeProcessor?.track !== localCameraTrack) {
          const processor = BackgroundProcessor({
            mode: enabled ? "background-blur" : "disabled",
            ...(enabled ? { blurRadius: 12 } : {}),
          });
          await localCameraTrack.setProcessor(processor);
          activeProcessor = { track: localCameraTrack, processor };
          backgroundProcessor.current = activeProcessor;
        } else {
          await activeProcessor.processor.switchTo(
            enabled ? { mode: "background-blur", blurRadius: 12 } : { mode: "disabled" },
          );
        }

        if (request === backgroundBlurRequest.current) {
          setBackgroundBlurEnabled(enabled);
        }
      } catch (error) {
        if (request === backgroundBlurRequest.current) {
          setBackgroundBlurEnabled(false);
          setBackgroundBlurError(
            error instanceof Error ? error.message : "Background blur could not be applied.",
          );
        }
      } finally {
        if (request === backgroundBlurRequest.current) {
          setBackgroundBlurBusy(false);
        }
      }
    },
    [backgroundBlurSupported, localCameraTrack],
  );

  useEffect(() => {
    if (
      backgroundBlurEnabled &&
      localCameraTrack &&
      backgroundProcessor.current?.track !== localCameraTrack
    ) {
      void updateBackgroundBlur(true);
    }
  }, [backgroundBlurEnabled, localCameraTrack, updateBackgroundBlur]);

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

  const receiveChatMessage = useCallback(
    (message: { payload: Uint8Array; from?: { identity: string; name?: string } }) => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(message.payload)) as unknown;
        const senderIdentity = message.from?.identity;
        if (!isChatPayload(payload) || !isParticipantIdentity(senderIdentity)) {
          return;
        }

        const recipientIdentity = payload.recipientIdentity ?? null;
        const conversation = recipientIdentity ? senderIdentity : EVERYONE;
        const nextMessage: ChatMessage = {
          id: payload.id,
          body: payload.body,
          senderIdentity,
          senderName: message.from?.name?.trim() || "Participant",
          recipientIdentity,
          recipientName: payload.recipientName?.trim() || null,
          sentAt: payload.sentAt,
        };
        setChatMessages((current) => appendUniqueMessage(current, nextMessage));
        if (!chatOpen || activeChatRecipient !== conversation) {
          setChatUnread((current) => ({
            ...current,
            [conversation]: (current[conversation] ?? 0) + 1,
          }));
        }
      } catch {
        // Ignore malformed data packets rather than interrupting the meeting.
      }
    },
    [activeChatRecipient, chatOpen],
  );

  const { send: sendChatData, isSending: isSendingChat } = useDataChannel(
    CHAT_TOPIC,
    receiveChatMessage,
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

  const markChatRead = useCallback((conversation: string) => {
    setChatUnread((current) => {
      if (!current[conversation]) {
        return current;
      }
      return { ...current, [conversation]: 0 };
    });
  }, []);

  const sendChatMessage = useCallback(
    async (body: string) => {
      const normalizedBody = body.trim();
      if (!normalizedBody || normalizedBody.length > MAX_CHAT_MESSAGE_LENGTH) {
        return;
      }

      const recipient = chatParticipants.find(
        (participant) => participant.identity === activeChatRecipient,
      );
      if (activeChatRecipient !== EVERYONE && !recipient) {
        throw new Error("The selected participant has left the meeting.");
      }
      const payload: ChatPayload = {
        id: createMessageId(),
        body: normalizedBody,
        sentAt: Date.now(),
        ...(recipient
          ? { recipientIdentity: recipient.identity, recipientName: recipient.name }
          : {}),
      };
      await sendChatData(new TextEncoder().encode(JSON.stringify(payload)), {
        reliable: true,
        ...(recipient ? { destinationIdentities: [recipient.identity] } : {}),
      });
      setChatMessages((current) =>
        appendUniqueMessage(current, {
          ...payload,
          senderIdentity: localParticipant.identity,
          senderName: localParticipant.name?.trim() || displayName || "You",
          recipientIdentity: payload.recipientIdentity ?? null,
          recipientName: payload.recipientName ?? null,
        }),
      );
    },
    [activeChatRecipient, chatParticipants, displayName, localParticipant, sendChatData],
  );

  const totalUnread = Object.values(chatUnread).reduce((total, count) => total + count, 0);

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
              setChatOpen(false);
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

      <div className={`room-content ${chatOpen ? "chat-is-open" : ""}`}>
        <div className="stage">
          {connected ? (
          <>
            {hasScreenShare ? (
              <div className="share-layout-switcher" role="group" aria-label="Shared screen size">
                <button
                  type="button"
                  className={shareLayout === SHARE_LAYOUT.focus ? "active" : ""}
                  aria-pressed={shareLayout === SHARE_LAYOUT.focus}
                  onClick={() => setShareLayout(SHARE_LAYOUT.focus)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
                  </svg>
                  <span>Full screen</span>
                </button>
                <button
                  type="button"
                  className={shareLayout === SHARE_LAYOUT.split ? "active" : ""}
                  aria-pressed={shareLayout === SHARE_LAYOUT.split}
                  onClick={() => setShareLayout(SHARE_LAYOUT.split)}
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
                hasScreenShare && shareLayout === SHARE_LAYOUT.split
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
        {connected && chatOpen ? (
          <ChatPanel
            localIdentity={localParticipant.identity}
            participants={chatContacts}
            recipient={activeChatRecipient}
            messages={chatMessages}
            unread={chatUnread}
            sending={isSendingChat}
            onRecipientChange={(identity) => {
              setChatRecipient(identity);
              markChatRead(identity);
            }}
            onSend={sendChatMessage}
            onClose={() => setChatOpen(false)}
          />
        ) : null}
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
            <ChatControl
              open={chatOpen}
              unread={totalUnread}
              onToggle={() => {
                setInviteOpen(false);
                if (!chatOpen) {
                  markChatRead(activeChatRecipient);
                }
                setChatOpen(!chatOpen);
              }}
            />
            <ReactionControl onReact={sendReaction} disabled={isSendingReaction} />
            <SettingsControl
              backgroundBlurEnabled={backgroundBlurEnabled}
              backgroundBlurBusy={backgroundBlurBusy}
              backgroundBlurSupported={backgroundBlurSupported}
              cameraAvailable={Boolean(localCameraTrack)}
              error={backgroundBlurError}
              onBackgroundBlurChange={updateBackgroundBlur}
            />
          </div>
          <DisconnectButton
            className="room-exit-button"
            aria-label="Leave meeting"
            title="Leave meeting"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 17l5-5-5-5M15 12H3" />
              <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
            </svg>
          </DisconnectButton>
        </>
      ) : null}
      <RoomAudioRenderer />
    </section>
  );
}

type ChatPanelProps = {
  localIdentity: string;
  participants: ChatParticipant[];
  recipient: string;
  messages: ChatMessage[];
  unread: Record<string, number>;
  sending: boolean;
  onRecipientChange: (identity: string) => void;
  onSend: (body: string) => Promise<void>;
  onClose: () => void;
};

function ChatPanel({
  localIdentity,
  participants,
  recipient,
  messages,
  unread,
  sending,
  onRecipientChange,
  onSend,
  onClose,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const visibleMessages = messages.filter((message) => {
    if (recipient === EVERYONE) {
      return message.recipientIdentity === null;
    }
    return (
      message.recipientIdentity !== null &&
      (message.senderIdentity === recipient ||
        (message.senderIdentity === localIdentity && message.recipientIdentity === recipient))
    );
  });
  const recipientName =
    recipient === EVERYONE
      ? "Everyone"
      : participants.find((participant) => participant.identity === recipient)?.name ?? "Participant";
  const recipientOnline =
    recipient === EVERYONE ||
    participants.some((participant) => participant.identity === recipient && participant.online);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [visibleMessages.length, recipient]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) {
      return;
    }
    setSendError(null);
    try {
      await onSend(message);
      setDraft("");
    } catch {
      setSendError("Message could not be sent. Check your connection and try again.");
    }
  }

  return (
    <aside className="chat-panel" aria-label="Meeting chat">
      <div className="chat-heading">
        <div>
          <p>In-call messages</p>
          <h2>Chat</h2>
        </div>
        <button type="button" aria-label="Close chat" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <label className="chat-recipient" htmlFor="chat-recipient">
        <span>Send to</span>
        <select
          id="chat-recipient"
          value={recipient}
          onChange={(event) => onRecipientChange(event.target.value)}
        >
          <option value={EVERYONE}>
            Everyone{unread[EVERYONE] ? ` (${unread[EVERYONE]} new)` : ""}
          </option>
          {participants.map((participant) => (
            <option key={participant.identity} value={participant.identity}>
              {participant.name}
              {!participant.online ? " (left)" : ""}
              {unread[participant.identity] ? ` · ${unread[participant.identity]} new` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="chat-context">
        <span className={recipient === EVERYONE ? "public" : "private"}>
          {recipient === EVERYONE ? "Public" : "Private"}
        </span>
        <p>
          {recipient === EVERYONE
            ? "Everyone in the meeting can read these messages."
            : recipientOnline
              ? `Only you and ${recipientName} can read these messages.`
              : `${recipientName} has left. You can still read this private conversation.`}
        </p>
      </div>

      <div className="chat-messages" ref={messageListRef} aria-live="polite">
        {visibleMessages.length === 0 ? (
          <div className="chat-empty">
            <span aria-hidden="true">💬</span>
            <strong>No messages yet</strong>
            <p>Start the conversation with {recipientName.toLowerCase()}.</p>
          </div>
        ) : (
          visibleMessages.map((message, index) => {
            const ownMessage = message.senderIdentity === localIdentity;
            const showSender =
              index === 0 || visibleMessages[index - 1]?.senderIdentity !== message.senderIdentity;
            return (
              <article key={message.id} className={`chat-message ${ownMessage ? "own" : ""}`}>
                {showSender ? (
                  <div className="chat-message-meta">
                    <strong>{ownMessage ? "You" : message.senderName}</strong>
                    <time dateTime={new Date(message.sentAt).toISOString()}>
                      {formatChatTime(message.sentAt)}
                    </time>
                  </div>
                ) : null}
                <p>{message.body}</p>
              </article>
            );
          })
        )}
      </div>

      <form className="chat-composer" onSubmit={(event) => void submitMessage(event)}>
        <label htmlFor="chat-message">Message {recipientName}</label>
        <div>
          <textarea
            id="chat-message"
            rows={2}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            placeholder={`Message ${recipientName}`}
            disabled={!recipientOnline}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="submit"
            disabled={!recipientOnline || !draft.trim() || sending}
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-8 18-2-7-8-3Zm8 3 4-4" /></svg>
          </button>
        </div>
        {sendError ? <p className="chat-send-error" role="alert">{sendError}</p> : null}
      </form>
    </aside>
  );
}

function ChatControl({ open, unread, onToggle }: { open: boolean; unread: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="chat-trigger"
      aria-label={unread ? `Open chat, ${unread} unread messages` : "Open chat"}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="chat-trigger-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 3V5Z" /></svg>
      </span>
      {unread ? <span className="chat-unread" aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
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
          const definition = MEETING_REACTIONS.find((item) => item.key === reaction.key);
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
            {MEETING_REACTIONS.map((reaction) => (
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
      </button>
    </div>
  );
}

type SettingsControlProps = {
  backgroundBlurEnabled: boolean;
  backgroundBlurBusy: boolean;
  backgroundBlurSupported: boolean;
  cameraAvailable: boolean;
  error: string | null;
  onBackgroundBlurChange: (enabled: boolean) => Promise<void>;
};

function SettingsControl({
  backgroundBlurEnabled,
  backgroundBlurBusy,
  backgroundBlurSupported,
  cameraAvailable,
  error,
  onBackgroundBlurChange,
}: SettingsControlProps) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const blurUnavailable =
    backgroundBlurBusy || !backgroundBlurSupported || (!cameraAvailable && !backgroundBlurEnabled);
  const blurDescription = !backgroundBlurSupported
    ? "Not supported in this browser"
    : backgroundBlurBusy
      ? "Applying video effect…"
      : !cameraAvailable && !backgroundBlurEnabled
        ? "Turn on your camera first"
        : "Keep your surroundings private";

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeSettings(event: PointerEvent) {
      if (!controlRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeSettings);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSettings);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="settings-control" ref={controlRef}>
      {open ? (
        <div className="room-settings-menu" role="dialog" aria-label="Meeting settings">
          <div className="room-settings-heading">
            <span>Settings</span>
            <small>Video effects</small>
          </div>
          <label className={`room-settings-option${blurUnavailable ? " unavailable" : ""}`}>
            <span className="room-settings-option-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="3" />
                <path d="M6.5 19a5.5 5.5 0 0 1 11 0M4 7h.01M20 7h.01M3 12h.01M21 12h.01M5 16h.01M19 16h.01" />
              </svg>
            </span>
            <span className="room-settings-option-copy">
              <strong>Blur background</strong>
              <small>{blurDescription}</small>
            </span>
            <input
              type="checkbox"
              checked={backgroundBlurEnabled}
              disabled={blurUnavailable}
              onChange={(event) => {
                void onBackgroundBlurChange(event.target.checked);
              }}
            />
            <span className="room-settings-switch" aria-hidden="true" />
          </label>
          {error ? <p className="room-settings-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
      <button
        type="button"
        className="settings-trigger"
        aria-label="Open meeting settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2V9.55h.4A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4.05v.4A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.4v4.05h-.4A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
      </button>
    </div>
  );
}

function isParticipantIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isChatPayload(value: unknown): value is ChatPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<ChatPayload>;
  return (
    typeof payload.id === "string" &&
    payload.id.length > 0 &&
    typeof payload.body === "string" &&
    payload.body.trim().length > 0 &&
    payload.body.length <= MAX_CHAT_MESSAGE_LENGTH &&
    typeof payload.sentAt === "number" &&
    Number.isFinite(payload.sentAt) &&
    (payload.recipientIdentity === undefined || isParticipantIdentity(payload.recipientIdentity)) &&
    (payload.recipientName === undefined || typeof payload.recipientName === "string")
  );
}

function appendUniqueMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  if (messages.some((current) => current.id === message.id)) {
    return messages;
  }
  return [...messages, message].slice(-500);
}

function createMessageId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatChatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}
