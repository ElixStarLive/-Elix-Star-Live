import { create } from 'zustand';

export type CallStatus =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended';

export interface CallParticipant {
  id: string;
  username: string;
  avatar: string;
}

interface CallStore {
  callId: string | null;
  status: CallStatus;
  remoteUser: CallParticipant | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  callStartTime: number | null;
  endReason: string | null;

  startOutgoingCall: (callId: string, remote: CallParticipant) => void;
  receiveIncomingCall: (callId: string, remote: CallParticipant) => void;
  setStatus: (status: CallStatus) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
  endCall: (reason?: string) => void;
  reset: () => void;
}

const initialState = {
  callId: null as string | null,
  status: 'idle' as CallStatus,
  remoteUser: null as CallParticipant | null,
  isAudioMuted: false,
  isVideoOff: false,
  isSpeakerOn: true,
  callStartTime: null as number | null,
  endReason: null as string | null,
};

export const useCallStore = create<CallStore>()((set) => ({
  ...initialState,

  startOutgoingCall: (callId, remote) =>
    set({
      callId,
      status: 'outgoing',
      remoteUser: remote,
      isAudioMuted: false,
      isVideoOff: false,
      callStartTime: null,
      endReason: null,
    }),

  receiveIncomingCall: (callId, remote) =>
    set({
      callId,
      status: 'incoming',
      remoteUser: remote,
      isAudioMuted: false,
      isVideoOff: false,
      callStartTime: null,
      endReason: null,
    }),

  setStatus: (status) =>
    set((s) => ({
      status,
      callStartTime: status === 'connected' && !s.callStartTime ? Date.now() : s.callStartTime,
    })),

  toggleAudio: () => set((s) => ({ isAudioMuted: !s.isAudioMuted })),
  toggleVideo: () => set((s) => ({ isVideoOff: !s.isVideoOff })),
  toggleSpeaker: () => set((s) => ({ isSpeakerOn: !s.isSpeakerOn })),

  endCall: (reason) =>
    set({
      status: 'ended',
      endReason: reason || 'Call ended',
    }),

  reset: () => set(initialState),
}));
