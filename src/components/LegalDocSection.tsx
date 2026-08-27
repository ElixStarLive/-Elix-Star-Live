interface LegalDocSectionProps {
  title: string;
  children: React.ReactNode;
}

export function LegalDocSection({ title, children }: LegalDocSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-fluid-base font-semibold text-white">{title}</h2>
      <div className="text-fluid-sm leading-relaxed text-white/70">{children}</div>
    </section>
  );
}
