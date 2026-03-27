import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Heart, AlertTriangle, Eye, Ban } from 'lucide-react';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

export default function Guidelines() {
  const navigate = useNavigate();

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#13151A] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-[#13151A] z-10 px-4 py-4 border-b border-transparent flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:brightness-125 rounded-full transition">
          <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Community Guidelines</h1>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto flex-1 overflow-y-auto">
        {/* Intro */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-[#C9A96E] to-[#B8943F] rounded-full mx-auto mb-4 flex items-center justify-center">
            <Heart className="w-10 h-10 text-black" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Our Community Values</h2>
          <p className="text-white/70">
            Elix Star is built on creativity, respect, and authenticity. These guidelines help keep our
            community safe and welcoming for everyone.
          </p>
        </div>

        {/* Guidelines Sections */}
        <GuidelineSection
          icon={<Heart className="w-6 h-6" />}
          title="Be Kind and Respectful"
          iconColor="text-white"
        >
          <p>Treat others with respect. Harassment, bullying, and hate speech have no place here.</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-white/70 mt-2">
            <li>No targeted harassment or bullying</li>
            <li>No hate speech based on race, religion, gender, etc.</li>
            <li>Respect others' privacy and boundaries</li>
          </ul>
        </GuidelineSection>

        <GuidelineSection
          icon={<Shield className="w-6 h-6" />}
          title="Keep Content Safe"
          iconColor="text-white"
        >
          <p>Help us maintain a safe environment for all users.</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-white/70 mt-2">
            <li>No sexual or adult content</li>
            <li>No violent or graphic content</li>
            <li>No promotion of dangerous activities</li>
            <li>No content involving minors in inappropriate situations</li>
          </ul>
        </GuidelineSection>

        <GuidelineSection
          icon={<Users className="w-6 h-6" />}
          title="Be Authentic"
          iconColor="text-white"
        >
          <p>Build trust by being genuine and honest.</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-white/70 mt-2">
            <li>Don't impersonate others</li>
            <li>Don't post misleading information</li>
            <li>Don't engage in spam or manipulation</li>
          </ul>
        </GuidelineSection>

        <GuidelineSection
          icon={<Eye className="w-6 h-6" />}
          title="Respect Intellectual Property"
          iconColor="text-white"
        >
          <p>Only share content you have the rights to use.</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-white/70 mt-2">
            <li>Don't post copyrighted content without permission</li>
            <li>Give credit to original creators</li>
            <li>Don't use copyrighted music without a license</li>
          </ul>
        </GuidelineSection>

        <GuidelineSection
          icon={<AlertTriangle className="w-6 h-6" />}
          title="No Illegal Activities"
          iconColor="text-white"
        >
          <p>Content that promotes illegal activities is strictly prohibited.</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-white/70 mt-2">
            <li>No promotion of illegal drugs</li>
            <li>No fraudulent schemes or scams</li>
            <li>No content that violates local laws</li>
          </ul>
        </GuidelineSection>

        <GuidelineSection
          icon={<Ban className="w-6 h-6" />}
          title="Consequences"
          iconColor="text-white"
        >
          <p>Violations may result in:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-white/70 mt-2">
            <li>Content removal</li>
            <li>Temporary account suspension</li>
            <li>Permanent account ban</li>
            <li>Reporting to law enforcement (for serious violations)</li>
          </ul>
        </GuidelineSection>

        {/* Footer */}
        <div className="mt-8 p-6 bg-white rounded-2xl">
          <p className="text-sm text-white/70 mb-4">
            These guidelines are designed to foster a positive environment for everyone. If you see
            something that violates these guidelines, please report it.
          </p>
          <button
            onClick={() => navigate('/report')}
            className="w-full py-3 bg-[#C9A96E] text-black rounded-xl font-bold hover:opacity-90 transition"
          >
            Report a Violation
          </button>
        </div>

        <div className="text-center mt-6 text-xs text-white/40">
          Last updated: February 4, 2026
        </div>
      </div>
      </div>
    </SettingsOptionSheet>
  );
}

function GuidelineSection({
  icon,
  title,
  iconColor,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 p-6 bg-white rounded-2xl">
      <div className="flex items-start gap-4 mb-3">
        <div className={`${iconColor} flex-shrink-0 mt-1`}>{icon}</div>
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      <div className="text-white/80">{children}</div>
    </div>
  );
}
