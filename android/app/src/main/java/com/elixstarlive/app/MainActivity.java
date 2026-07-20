package com.elixstarlive.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    ensureSystemBarsVisible();
    // Capacitor WebView may apply insets after create — re-assert shortly after.
    View decor = getWindow() != null ? getWindow().getDecorView() : null;
    if (decor != null) {
      decor.post(this::ensureSystemBarsVisible);
      decor.postDelayed(this::ensureSystemBarsVisible, 400);
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    ensureSystemBarsVisible();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) {
      ensureSystemBarsVisible();
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
