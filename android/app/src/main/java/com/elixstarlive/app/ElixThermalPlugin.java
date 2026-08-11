package com.elixstarlive.app;

import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android thermal status → Elix Live quality tiers.
 * Maps PowerManager thermal status to nominal / fair / serious / critical.
 */
@CapacitorPlugin(name = "ElixThermal")
public class ElixThermalPlugin extends Plugin {
  private PowerManager.OnThermalStatusChangedListener thermalListener;

  @Override
  public void load() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return;
    }
    Context ctx = getContext();
    if (ctx == null) return;
    PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
    if (pm == null) return;
    thermalListener =
        status -> {
          JSObject data = new JSObject();
          data.put("tier", tierFromAndroidStatus(status));
          data.put("raw", rawFromAndroidStatus(status));
          notifyListeners("thermalStateChange", data);
        };
    try {
      pm.addThermalStatusListener(ctx.getMainExecutor(), thermalListener);
    } catch (Exception ignored) {
      thermalListener = null;
    }
  }

  @Override
  protected void handleOnDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && thermalListener != null) {
      Context ctx = getContext();
      if (ctx != null) {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
          try {
            pm.removeThermalStatusListener(thermalListener);
          } catch (Exception ignored) {
            /* ignore */
          }
        }
      }
    }
    thermalListener = null;
    super.handleOnDestroy();
  }

  @PluginMethod
  public void getThermalState(PluginCall call) {
    JSObject data = new JSObject();
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      data.put("tier", "nominal");
      data.put("raw", "unsupported");
      call.resolve(data);
      return;
    }
    Context ctx = getContext();
    if (ctx == null) {
      data.put("tier", "nominal");
      data.put("raw", "no_context");
      call.resolve(data);
      return;
    }
    PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
    if (pm == null) {
      data.put("tier", "nominal");
      data.put("raw", "no_pm");
      call.resolve(data);
      return;
    }
    int status = pm.getCurrentThermalStatus();
    data.put("tier", tierFromAndroidStatus(status));
    data.put("raw", rawFromAndroidStatus(status));
    call.resolve(data);
  }

  private static String tierFromAndroidStatus(int status) {
    if (status >= PowerManager.THERMAL_STATUS_CRITICAL) return "critical";
    if (status >= PowerManager.THERMAL_STATUS_SEVERE) return "serious";
    if (status >= PowerManager.THERMAL_STATUS_MODERATE) return "fair";
    return "nominal";
  }

  private static String rawFromAndroidStatus(int status) {
    switch (status) {
      case PowerManager.THERMAL_STATUS_NONE:
        return "none";
      case PowerManager.THERMAL_STATUS_LIGHT:
        return "light";
      case PowerManager.THERMAL_STATUS_MODERATE:
        return "moderate";
      case PowerManager.THERMAL_STATUS_SEVERE:
        return "severe";
      case PowerManager.THERMAL_STATUS_CRITICAL:
        return "critical";
      case PowerManager.THERMAL_STATUS_EMERGENCY:
        return "emergency";
      case PowerManager.THERMAL_STATUS_SHUTDOWN:
        return "shutdown";
      default:
        return "unknown_" + status;
    }
  }
}
