import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function LegalAudio() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col overflow-y-auto p-4 pb-20">
        <header className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Audio & Music Disclaimer</h1>
          <div className="w-6" />
        </header>

        <div className="text-sm text-white/75 space-y-5 leading-6">
          <Section title="Audio Content">
            <p>
              Audio used within Elix Star Live falls into the following categories:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Original audio:</strong> Created by Elix Star Live or its partners</li>
              <li><strong>User-generated audio:</strong> Uploaded or recorded by users</li>
              <li><strong>Licensed audio:</strong> Obtained under royalty-free or commercial licences</li>
            </ul>
          </Section>

          <Section title="User Responsibility">
            <p>
              When uploading content that contains audio, you confirm that you either:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Created the audio yourself (it is your original work)</li>
              <li>Have obtained permission or a licence from the copyright holder</li>
              <li>The audio is in the public domain or available under a Creative Commons licence</li>
            </ul>
          </Section>

          <Section title="Audio Removal">
            <p>
              We reserve the right to mute, remove, or replace audio in any content that infringes
              on third-party copyrights. This may happen automatically or through manual review
              following a DMCA takedown notice.
            </p>
          </Section>

          <Section title="Live Streaming Audio">
            <p>
              Playing copyrighted music during live streams may result in the stream being muted
              or terminated. You are responsible for ensuring you have the right to broadcast any
              audio content during your live sessions.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For audio-related enquiries or disputes, contact us at{' '}
              <span className="text-white font-medium">legal@elixstarlive.com</span>
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-white font-semibold text-base mb-2">{title}</h2>
      {children}
    </div>
  );
}
