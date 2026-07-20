import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Heart, AlertTriangle, Eye, Ban } from 'lucide-react';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

export default function Guidelines() {
  const navigate = useNavigate();

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] text-white flex flex-col">
        <header className="flex items-center justify-center mb-4 px-4 pt-2">
          <h1 className="font-bold text-lg">Community Guidelines</h1>
        </header>
        <div className="overflow-y-auto min-h-0 px-4 pb-3">
          <p className="text-xs text-white/40 italic mb-4">Last updated: February 4, 2026</p>
          <div className="text-sm text-white/75 space-y-5 leading-6">
            <p>
              Elix Star is built on creativity, respect, and authenticity. These guidelines help keep
              our community safe and welcoming for everyone.
            </p>

            <Section icon={<Heart className="w-5 h-5" />} title="Be Kind and Respectful">
              <p>Treat others with respect. Harassment, bullying, and hate speech have no place here.</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>No targeted harassment or bullying</li>
                <li>No hate speech based on race, religion, gender, etc.</li>
                <li>Respect others' privacy and boundaries</li>
              </ul>
            </Section>

            <Section icon={<Shield className="w-5 h-5" />} title="Keep Content Safe">
              <p>Help us maintain a safe environment for all users.</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>No sexual or adult content</li>
                <li>No violent or graphic content</li>
                <li>No promotion of dangerous activities</li>
                <li>No content involving minors in inappropriate situations</li>
              </ul>
            </Section>

            <Section icon={<Users className="w-5 h-5" />} title="Be Authentic">
              <p>Build trust by being genuine and honest.</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Don't impersonate others</li>
                <li>Don't post misleading information</li>
                <li>Don't engage in spam or manipulation</li>
              </ul>
            </Section>

            <Section icon={<Eye className="w-5 h-5" />} title="Respect Intellectual Property">
              <p>Only share content you have the rights to use.</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Don't post copyrighted content without permission</li>
                <li>Give credit to original creators</li>
                <li>Don't use copyrighted music without a license</li>
              </ul>
            </Section>

            <Section icon={<AlertTriangle className="w-5 h-5" />} title="No Illegal Activities">
              <p>Content that promotes illegal activities is strictly prohibited.</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>No promotion of illegal drugs</li>
                <li>No fraudulent schemes or scams</li>
                <li>No content that violates local laws</li>
              </ul>
            </Section>

            <Section icon={<Ban className="w-5 h-5" />} title="Consequences">
              <p>Violations may result in:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Content removal</li>
                <li>Temporary account suspension</li>
                <li>Permanent account ban</li>
                <li>Reporting to law enforcement (for serious violations)</li>
              </ul>
            </Section>

            <div>
              <p className="mb-3">
                These guidelines are designed to foster a positive environment for everyone. If you see
                something that violates these guidelines, please report it.
              </p>
              <button
                type="button"
                onClick={() => navigate('/report')}
                className="w-full py-3 bg-[#D4AF37] text-black rounded-xl font-bold hover:opacity-90 transition"
              >
                Report a Violation
              </button>
            </div>

            <div className="pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition"
              >
                Go to Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-white font-semibold text-base mb-2">
        <span className="text-[#D4AF37] flex-shrink-0">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}
