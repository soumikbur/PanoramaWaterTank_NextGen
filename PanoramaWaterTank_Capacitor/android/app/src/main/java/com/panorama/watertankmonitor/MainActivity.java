package com.panorama.watertankmonitor;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Ensure native Android status bar is permanently visible with solid white background and dark icons
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.WHITE);
        window.setNavigationBarColor(Color.WHITE);

        View decorView = window.getDecorView();
        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, decorView);
        if (insetsController != null) {
            insetsController.show(WindowInsetsCompat.Type.statusBars());
            insetsController.show(WindowInsetsCompat.Type.navigationBars());
            insetsController.setAppearanceLightStatusBars(true); // Dark icons for light status bar (clock, battery, wifi)
            insetsController.setAppearanceLightNavigationBars(true); // Dark navigation bar handle
        }

        // Prevent black flashing and ensure proper hardware-accelerated surface on low-end devices and emulators
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            webView.setBackgroundColor(Color.parseColor("#F8FAFC"));
        }
    }
}
