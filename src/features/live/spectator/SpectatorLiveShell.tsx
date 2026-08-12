/**
 * Watch route shell — keeps SpectatorLiveScreen mounted while nested overlays
 * (profile, etc.) render via <Outlet /> without tearing down WS/LiveKit.
 */

import { Outlet, useParams } from 'react-router-dom';
import SpectatorPage from '../../../pages/SpectatorPage';

export default function SpectatorLiveShell() {
  const { streamId } = useParams<{ streamId: string }>();
  return (
    <>
      <SpectatorPage key={streamId} />
      <Outlet />
    </>
  );
}
