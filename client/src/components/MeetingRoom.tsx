import { useEffect, useState } from "react";
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useConnectionState,
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
  onLeave: () => void;
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
  mediaError: string | null;
  deviceMessage: string | null;
  onLeave: () => void;
};

function RoomView({ title, meetingId, joinLink, mediaError, deviceMessage, onLeave }: RoomViewProps) {
  const connection = useConnectionState();
  const connected = connection === ConnectionState.Connected;
  const [slow, setSlow] = useState(false);
  const [copied, setCopied] = useState(false);
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });

  useEffect(() => {
    if (connected) {
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [connected]);

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
            aria-label={copied ? "Meeting link copied" : "Copy meeting link"}
            onClick={() => {
              void copyText(joinLink).then(setCopied);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 15 15 9M7.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" />
            </svg>
            <span>{copied ? "Copied" : "Invite"}</span>
          </button>
          {!connected ? (
            <button type="button" className="room-back-button" onClick={onLeave}>
              Back
            </button>
          ) : null}
        </div>
      </header>

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
          <GridLayout tracks={tracks}>
            <ParticipantTile />
          </GridLayout>
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
        <div className="room-controls" aria-label="Meeting controls">
          <ControlBar
            variation="minimal"
            controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: true }}
          />
        </div>
      ) : null}
      <RoomAudioRenderer />
    </section>
  );
}
