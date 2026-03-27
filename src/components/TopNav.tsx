import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [hoveredTopTabIndex, setHoveredTopTabIndex] = useState<number | null>(
    null,
  );

  // Show golden top bar **only** on For You page
  if (location.pathname !== "/feed") {
    return null;
  }

  // 7 tabs matching /Icons/topbar.png: LIVE | STEM | Explore | Following | Shop | For You | Search
  const tabWidths = [13, 12, 15, 18, 12, 15, 15];
  let hoveredTopTabLeft = 0;
  let hoveredTopTabRight = 0;
  if (hoveredTopTabIndex !== null) {
    let left = 0;
    for (let i = 0; i < hoveredTopTabIndex; i++) left += tabWidths[i];
    hoveredTopTabLeft = left;
    hoveredTopTabRight = 100 - left - tabWidths[hoveredTopTabIndex];
  }

  return (
    <div
      className="fixed left-0 right-0 z-[9999] flex justify-center pointer-events-none"
      style={{ top: "var(--topnav-anchor-top)" }}
    >
      <div className="w-full max-w-[480px] relative">
        <div
          className="relative w-full"
          style={{ transform: "scaleY(0.80)", transformOrigin: "top" }}
        >
          {/* CRITICAL FIX: HARDCODED TO topbar.png */}
          <img
            src="/Icons/topbar.png"
            alt="Navigation"
            className="w-full h-auto pointer-events-none block"
            draggable={false}
            style={{
              filter:
                "drop-shadow(0 0 20px rgba(201,169,110,0.5)) drop-shadow(0 4px 15px rgba(0,0,0,0.6))",
            }}
          />
          {/* Hover highlight layer */}
          <img
            src="/Icons/topbar.png"
            alt=""
            className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-200 block"
            draggable={false}
            style={{
              opacity: hoveredTopTabIndex === null ? 0 : 1,
              filter: "brightness(1.25) saturate(1.4) contrast(1.15)",
              clipPath:
                hoveredTopTabIndex === null
                  ? "inset(0 100% 0 0)"
                  : `inset(0 ${hoveredTopTabRight}% 0 ${hoveredTopTabLeft}%)`,
            }}
          />

          {/* Invisible tap targets overlaid on the image */}
          <div className="absolute inset-0 flex items-center pointer-events-auto z-10">
            {/* 0: LIVE */}
            <button
              type="button"
              onClick={() => navigate("/live", { replace: true })}
              onMouseEnter={() => setHoveredTopTabIndex(0)}
              onMouseLeave={() => setHoveredTopTabIndex(null)}
              className="h-full w-full bg-transparent focus:outline-none active:bg-transparent appearance-none border-0 p-0 m-0 cursor-pointer"
              style={
                {
                  width: "13%",
                  minWidth: 0,
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Live"
            />
            {/* 1: STEM */}
            <button
              type="button"
              onClick={() => navigate("/stem")}
              onMouseEnter={() => setHoveredTopTabIndex(1)}
              onMouseLeave={() => setHoveredTopTabIndex(null)}
              className="h-full w-full bg-transparent focus:outline-none active:bg-transparent appearance-none border-0 p-0 m-0 cursor-pointer"
              style={
                {
                  width: "12%",
                  minWidth: 0,
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="STEM"
            />
            {/* 2: Explore */}
            <button
              type="button"
              onClick={() => navigate("/discover")}
              onMouseEnter={() => setHoveredTopTabIndex(2)}
              onMouseLeave={() => setHoveredTopTabIndex(null)}
              className="h-full w-full bg-transparent focus:outline-none active:bg-transparent appearance-none border-0 p-0 m-0 cursor-pointer"
              style={
                {
                  width: "15%",
                  minWidth: 0,
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Explore"
            />
            {/* 3: Following */}
            <button
              type="button"
              onClick={() => navigate("/following")}
              onMouseEnter={() => setHoveredTopTabIndex(3)}
              onMouseLeave={() => setHoveredTopTabIndex(null)}
              className="h-full w-full bg-transparent focus:outline-none active:bg-transparent appearance-none border-0 p-0 m-0 cursor-pointer"
              style={
                {
                  width: "18%",
                  minWidth: 0,
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Following"
            />
            {/* 4: Shop */}
            <button
              type="button"
              onClick={() => navigate("/shop")}
              onMouseEnter={() => setHoveredTopTabIndex(4)}
              onMouseLeave={() => setHoveredTopTabIndex(null)}
              className="h-full w-full bg-transparent focus:outline-none active:bg-transparent appearance-none border-0 p-0 m-0 cursor-pointer"
              style={
                {
                  width: "12%",
                  minWidth: 0,
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Shop"
            />
            {/* 5: For You */}
            <button
              type="button"
              onClick={() => navigate("/feed")}
              onMouseEnter={() => setHoveredTopTabIndex(5)}
              onMouseLeave={() => setHoveredTopTabIndex(null)}
              className="h-full w-full bg-transparent focus:outline-none active:bg-transparent appearance-none border-0 p-0 m-0 cursor-pointer"
              style={
                {
                  width: "15%",
                  minWidth: 0,
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="For You"
            />
            {/* 6: Search */}
            <button
              type="button"
              onClick={() => navigate("/search")}
              onMouseEnter={() => setHoveredTopTabIndex(6)}
              onMouseLeave={() => setHoveredTopTabIndex(null)}
              className="h-full w-full bg-transparent focus:outline-none active:bg-transparent appearance-none border-0 p-0 m-0 cursor-pointer"
              style={
                {
                  width: "15%",
                  minWidth: 0,
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
              title="Search"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
