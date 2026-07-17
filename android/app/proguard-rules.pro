# Elix Star Live - ProGuard Configuration
# Optimized for Capacitor

# Keep Capacitor HTTP / Cookies plugins (login + API)
-keep class com.getcapacitor.plugin.http.** { *; }
-keep class com.getcapacitor.plugin.CapacitorHttp.** { *; }
-keep class com.getcapacitor.plugin.CapacitorCookies.** { *; }
-keepclassmembers class com.getcapacitor.** {
    public <methods>;
}

# Keep Chromium / WebView internals
-keep class org.chromium.** { *; }

# Keep OkHttp for networking
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**

# Keep Gson for JSON parsing
-keep class com.google.gson.** { *; }
-keepattributes *Annotation*, Signature
-dontwarn sun.misc.**

# Keep app classes
-keep class com.elixstarlive.app.** { *; }

# Keep @capgo/native-purchases (Google Play Billing bridge) — R8 must not strip it
-keep class ee.forgr.nativepurchases.** { *; }
-keep class com.android.billingclient.** { *; }
-dontwarn com.android.billingclient.**

# Keep Capacitor Push Notifications plugin + Firebase Messaging
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }
-keep class com.google.firebase.messaging.** { *; }
-dontwarn com.google.firebase.**

# Keep JavaScript interface for WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Keep R class
-keepclassmembers class **.R$* {
    public static <fields>;
}

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
