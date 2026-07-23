package com.elixstarlive.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    ensureSystemBarsVisible();
    allowInlineMediaAutoplay();
    // Capacitor WebView may apply insets after create — re-assert shortly after.
    View decor = getWindow() != null ? getWindow().getDecorView() : null;
    if (decor != null) {
      decor.post(this::ensureSystemBarsVisible);
      decor.post(this::allowInlineMediaAutoplay);
      decor.postDelayed(this::ensureSystemBarsVisible, 400);
      decor.postDelayed(this::allowInlineMediaAutoplay, 400);
    }
  }

  @Override
  public void onStart() {
    super.onStart();
    allowInlineMediaAutoplay();
  }

  @Override
  public void onResume() {
    super.onResume();
    ensureSystemBarsVisible();
    allowInlineMediaAutoplay();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) {
      ensureSystemBarsVisible();
      allowInlineMediaAutoplay();
    }
  }

  /**
   * Live / camera / feed videos must start without a tap. Without this, Android
   * WebView blocks autoplay and shows the stuck white play icon.
   */
  private void allowInlineMediaAutoplay() {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    WebSettings settings = webView.getSettings();
    if (settings == null) return;
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setDomStorageEnabled(true);
    // Keep media inline — fullscreen media chrome also shows a white play affordance.
    try {
      settings.setMediaPlaybackRequiresUserGesture(false);
    } catch (Exception ignored) {
      /* ignore */
    }
  }

  /**
   * Keep the real phone status bar (time / date / battery) visible at all times —
   * including during live battles. Dark live UI uses light (white) status icons.
   */
  private void ensureSystemBarsVisible() {
    Window window = getWindow();
    if (window == null) return;

    WindowCompat.setDecorFitsSystemWindows(window, false);
    window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
    window.addFlags(WindowManager.LayoutParams.FLAG_FORCE_NOT_FULLSCREEN);
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    // Transparent so content draws edge-to-edge; white icons stay readable on black live UI.
    window.setStatusBarColor(Color.TRANSPARENT);
    window.setNavigationBarColor(Color.BLACK);

    View decor = window.getDecorView();
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(window, decor);
    if (controller != null) {
      controller.show(
          WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
      controller.setAppearanceLightStatusBars(false);
      controller.setAppearanceLightNavigationBars(false);
      controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_DEFAULT);
    }
  }
}
