import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff } from 'lucide-react';
import { useCallStore } from '../store/useCallStore';
import { acceptCall, rejectCall } from '../lib/callService';
import { AvatarRing } from './AvatarRing';

export function IncomingCallModal() {
  const navigate = useNavigate();
  const { callId, status, remoteUser } = useCallStore();

  useEffect(() => {
    if (status === 'connecting' && callId) {
      navigate('/call');
    }
  }, [status, callId, navigate]);

  if (status !== 'incoming' || !callId || !remoteUser) return null;

  const handleAccept = async () => {
    await acceptCall(callId);
    navigate('/call');
  };

  const handleReject = async () => {
    await rejectCall(callId);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#13151A]/70 backdrop-blur-md flex items-center justify-center">
      <div className="bg-[#13151A] rounded-3xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        {remoteUser.avatar ? (
          <AvatarRing src={remoteUser.avatar} alt={remoteUser.username} size={96} className="mx-auto mb-4" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-[#13151A] border border-[#C9A96E]/40 mx-auto mb-4 flex items-center justify-center text-3xl text-white">
            {remoteUser.username[0]?.toUpperCase()}
          </div>
        )}

        <h2 className="text-white text-xl font-bold mb-1">
          {remoteUser.username}
        </h2>
        <p className="text-white/60 text-sm mb-8">Incoming video call...</p>

        <div className="flex items-center justify-center gap-12">
          <button
            onClick={handleReject}
            title="Decline call"
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </button>

          <button
            onClick={handleAccept}
            title="Accept call"
            className="w-16 h-16 rounded-full bg-[#C9A96E] flex items-center justify-center shadow-lg active:scale-95 transition-transform animate-pulse"
          >
            <Phone className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
