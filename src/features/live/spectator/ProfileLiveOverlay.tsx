/**
 * Full-screen profile overlay on top of an active watch session.
 * Live video/chat/WS stay mounted underneath — closing returns instantly.
 */

import Profile from '../../../pages/Profile';

export default function ProfileLiveOverlay() {
  return (
    <div className="fixed inset-0 z-[99999] bg-black">
      <Profile />
    </div>
  );
}
