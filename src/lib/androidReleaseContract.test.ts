import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Step 29: the Play AAB identity must stay locked to this app.
 * Reads the Gradle/manifest files the bundle is built from — not a runtime claim.
 */
const ROOT = resolve(__dirname, "../..");
const appGradle = readFileSync(resolve(ROOT, "android/app/build.gradle"), "utf8");
const variables = readFileSync(resolve(ROOT, "android/variables.gradle"), "utf8");
const manifest = readFileSync(
  resolve(ROOT, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
const capacitor = readFileSync(resolve(ROOT, "capacitor.config.ts"), "utf8");
const googleServices = readFileSync(
  resolve(ROOT, "android/app/google-services.json"),
  "utf8",
);

describe("Android release identity", () => {
  it("uses package com.elixstarlive.app with no suffix", () => {
    expect(appGradle).toMatch(/applicationId "com\.elixstarlive\.app"/);
    expect(appGradle).toMatch(/namespace "com\.elixstarlive\.app"/);
    expect(appGradle).not.toMatch(/applicationIdSuffix/);
    expect(capacitor).toMatch(/appId:\s*'com\.elixstarlive\.app'/);
    expect(googleServices).toContain('"package_name": "com.elixstarlive.app"');
    expect(googleServices).toContain('"project_id": "elix-star-live-86271"');
  });

  it("targets and compiles API 36", () => {
    expect(variables).toMatch(/compileSdkVersion\s*=\s*36/);
    expect(variables).toMatch(/targetSdkVersion\s*=\s*36/);
    expect(appGradle).toContain("targetSdkVersion rootProject.ext.targetSdkVersion");
    expect(appGradle).toContain("compileSdk rootProject.ext.compileSdkVersion");
  });

  it("keeps minSdk at the current product floor", () => {
    expect(variables).toMatch(/minSdkVersion\s*=\s*23/);
  });

  it("ships a signed, minified, non-cleartext release type", () => {
    expect(appGradle).toMatch(/release\s*\{[\s\S]*minifyEnabled true/);
    expect(appGradle).toMatch(/signingConfig signingConfigs\.release/);
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).not.toContain('android:debuggable="true"');
  });
});
