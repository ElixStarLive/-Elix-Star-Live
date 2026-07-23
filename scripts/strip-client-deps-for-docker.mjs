/**
 * Coolify/Docker runner: drop client/mobile packages from package.json
 * so the production image stays small enough to export.
 * Server code does not import these packages.
 */
import fs from "node:fs";

const CLIENT_DEPS = [
  "@capacitor/android",
  "@capacitor/app",
  "@capacitor/clipboard",
  "@capacitor/core",
  "@capacitor/ios",
  "@capacitor/preferences",
  "@capacitor/push-notifications",
  "@capacitor/share",
  "@capgo/capacitor-social-login",
  "@capgo/native-purchases",
  "@mediapipe/tasks-vision",
  "@radix-ui/react-dialog",
  "class-variance-authority",
  "clsx",
  "framer-motion",
  "livekit-client",
  "lucide-react",
  "react",
  "react-dom",
  "react-router-dom",
  "tailwind-merge",
  "zustand",
];

const pkgPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

for (const name of CLIENT_DEPS) {
  delete pkg.dependencies?.[name];
}
delete pkg.devDependencies;

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const lockPath = new URL("../package-lock.json", import.meta.url);
try {
  fs.unlinkSync(lockPath);
} catch {
  /* optional */
}

console.log(
  `[docker] stripped ${CLIENT_DEPS.length} client deps; remaining production deps: ${Object.keys(pkg.dependencies || {}).length}`,
);
