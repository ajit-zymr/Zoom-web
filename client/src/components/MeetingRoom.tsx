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

  return (
    <section className="room">
      <header className="room-bar">
        <div>
          <p className="eyebrow">Atrium</p>
          <h1>{title}</h1>
          <p className="room-id">Meeting ID {meetingId}</p>
        </div>
        <div className="room-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void copyText(joinLink).then(setCopied);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          {!connected ? (
            <button type="button" onClick={onLeave}>
              Back
            </button>
          ) : null}
        </div>
      </header>

      <p className={`status-banner ${connected ? "ready" : "warn"}`} role="status">
        {status}
      </p>
      {mediaError ? <p className="form-error room-note">{mediaError}</p> : null}
      {deviceMessage ? <p className="room-note">{deviceMessage}</p> : null}

      <div className="stage">
        {connected ? (
          <GridLayout tracks={tracks}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div className="waiting">
            <p>{status}</p>
          </div>
        )}
      </div>

      {connected ? (
        <ControlBar
          variation="minimal"
          controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: true }}
        />
      ) : null}
      <RoomAudioRenderer />
    </section>
  );
}
