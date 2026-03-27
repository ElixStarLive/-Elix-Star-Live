import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
/* Bundled copy of `public/Icons/bottombar.png` — update both files if you change the art. */
import bottomBarPng from "../assets/bottombar.png";

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  if (
    location.pathname === "/live" ||
    location.pathname.startsWith("/live/")
  ) {
    return null;
  }

  return (
    <nav
      className="pointer-events-none bg-transparent fixed inset-x-0 bottom-0 top-auto z-[10002] pb-[var(--safe-bottom)]"
    >
      {/* Same width as main / Inbox: max-w-[480px], no extra horizontal shrink */}
      <div className="flex justify-center bg-transparent">
        <div className="relative w-full max-w-[480px] mx-auto">
          <img
            src={bottomBarPng}
            alt=""
            className="relative w-full h-auto pointer-events-none block"
            draggable={false}
            loading="eager"
            style={{
              filter: "drop-shadow(0 0 8px rgba(0,0,0,0.6))",
            }}
          />

          <div className="absolute inset-0 flex items-stretch pointer-events-auto">
            <button
              onClick={() => navigate("/feed")}
              className="flex-1 h-full bg-transparent border-0 p-0 m-0 appearance-none focus:outline-none active:opacity-70 transition-opacity"
              style={
                {
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Home"
            />
            <button
              onClick={() => navigate("/friends")}
              className="flex-1 h-full bg-transparent border-0 p-0 m-0 appearance-none focus:outline-none active:opacity-70 transition-opacity"
              style={
                {
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Friends"
            />
            <button
              onClick={() => navigate("/create")}
              className="flex-1 h-full bg-transparent border-0 p-0 m-0 appearance-none focus:outline-none active:opacity-70 transition-opacity"
              style={
                {
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Create"
            />
            <button
              onClick={() => navigate("/inbox")}
              className="flex-1 h-full bg-transparent border-0 p-0 m-0 appearance-none focus:outline-none active:opacity-70 transition-opacity"
              style={
                {
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Inbox"
            />
            <button
              onClick={() => navigate("/profile")}
              className="flex-1 h-full bg-transparent border-0 p-0 m-0 appearance-none focus:outline-none active:opacity-70 transition-opacity"
              style={
                {
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Profile"
            />
          </div>
        </div>
      </div>
    </nav>
  );
};
