/** Small corner gift icons on a battle creator tile (not full video). */
export function BattleTileGiftIcons({ icons }: { icons: string[] }) {
  if (!icons?.length) return null;
  const shown = icons.slice(-3);
  return (
    <div className="absolute top-1 left-1 z-[16] pointer-events-none flex flex-col-reverse items-start gap-0.5">
      {shown.map((src, i) => (
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          className="w-5 h-5 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
        />
      ))}
    </div>
  );
}
