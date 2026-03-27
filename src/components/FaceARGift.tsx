import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

type FaceARGiftProps = {
  giftType: string;
  color: string;
  onComplete?: () => void;
};

export function FaceARGift({ giftType, color, onComplete }: FaceARGiftProps) {
  useEffect(() => {
    const t = window.setTimeout(() => onComplete?.(), 2500);
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[400] pointer-events-none flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="px-5 py-4 rounded-2xl border border-transparent bg-[#13151A] text-white text-center"
        style={{ boxShadow: `0 0 40px ${color}55` }}
      >
        <div className="text-xs font-bold tracking-wide text-white/70">Gift</div>
        <div className="text-lg font-black mt-1">{giftType}</div>
      </motion.div>
    </div>
  );
}

