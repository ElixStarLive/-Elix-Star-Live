import fs from 'fs';

const files = [
  'src/features/live/host/useLiveHostController.tsx',
  'src/features/live/spectator/useLiveSpectatorController.tsx',
];

const keys = [
  'missionWatchMin',
  'setMissionWatchMin',
  'missionGiftsSent',
  'setMissionGiftsSent',
  'missionWatchGoal',
  'setMissionWatchGoal',
  'missionGiftsGoal',
  'setMissionGiftsGoal',
  'loadEngagementMissions',
];

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  if (!c.includes('const missionsUi = useLiveEngagementMissionsUi')) {
    console.log('skip (no bag)', file);
    continue;
  }
  for (const k of keys) {
    c = c.replace(new RegExp(`(?<!missionsUi\\.)\\b${k}\\b`, 'g'), `missionsUi.${k}`);
  }
  c = c.replace(/missionsUi\.missionsUi\./g, 'missionsUi.');
  fs.writeFileSync(file, c);
  console.log('patched', file);
}
