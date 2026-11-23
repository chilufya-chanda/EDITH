package com.edith.spotter;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.CameraSelector;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * EDITH Spotter — home screen.
 *
 * Enter the backend's URL, give this device a name, and tap one button to
 * start/stop spotting. Spotting is always visible to whoever is holding
 * this phone via the persistent foreground-service notification — there
 * is no hidden mode.
 */
public class HomeFragment extends Fragment {

    private static final String PREFS_NAME = "edith_spotter_prefs";
    private static final String PREF_SERVER_URL = "server_url";
    private static final String PREF_DEVICE_UUID = "device_uuid";
    private static final String PREF_CAMERA_FACING = "camera_facing";

    private EditText serverUrlInput;
    private EditText deviceUuidInput;
    private Button toggleButton;
    private Button testConnectionButton;
    private Button switchCameraButton;
    private TextView statusText;
    private TextView connectionResultText;
    private TextView spottingStateText;
    private TextView cameraFacingText;
    private RadarSweepView radarView;

    private boolean spotting = false;
    private int cameraFacing = CameraSelector.LENS_FACING_BACK;
    private SharedPreferences prefs;
    private StatsTracker statsTracker;

    private final ActivityResultLauncher<String[]> permissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), this::onPermissionsResult);

    private final BroadcastReceiver resultReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String text = intent.getStringExtra(SpottingService.EXTRA_RESULT_TEXT);
            if (text != null && statusText != null) {
                statusText.setText("Spotting is ON.\n" + text
                        + "\nOnly matches against people enrolled in active cases are reported.");
            }
        }
    };

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_home, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        statsTracker = new StatsTracker(requireContext());

        serverUrlInput = view.findViewById(R.id.serverUrlInput);
        deviceUuidInput = view.findViewById(R.id.deviceUuidInput);
        toggleButton = view.findViewById(R.id.toggleButton);
        testConnectionButton = view.findViewById(R.id.testConnectionButton);
        switchCameraButton = view.findViewById(R.id.switchCameraButton);
        statusText = view.findViewById(R.id.statusText);
        connectionResultText = view.findViewById(R.id.connectionResultText);
        spottingStateText = view.findViewById(R.id.spottingStateText);
        cameraFacingText = view.findViewById(R.id.cameraFacingText);
        radarView = view.findViewById(R.id.radarView);

        serverUrlInput.setText(prefs.getString(PREF_SERVER_URL, ""));
        deviceUuidInput.setText(prefs.getString(PREF_DEVICE_UUID, defaultDeviceName()));
        cameraFacing = prefs.getInt(PREF_CAMERA_FACING, CameraSelector.LENS_FACING_BACK);
        spotting = statsTracker.isSessionActive();

        updateSpottingUi();
        updateCameraFacingUi();

        testConnectionButton.setOnClickListener(v -> testConnection());
        switchCameraButton.setOnClickListener(v -> switchCamera());

        toggleButton.setOnClickListener(v -> {
            if (!spotting) {
                if (hasPermissions()) {
                    startSpotting();
                } else {
                    requestPermissions();
                }
            } else {
                stopSpotting();
            }
        });
    }

    @Override
    public void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(SpottingService.ACTION_RESULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requireContext().registerReceiver(resultReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            requireContext().registerReceiver(resultReceiver, filter);
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        requireContext().unregisterReceiver(resultReceiver);
    }

    private String defaultDeviceName() {
        return "spotter-" + (System.currentTimeMillis() % 100000);
    }

    private void saveServerSettings(String serverUrl, String deviceUuid) {
        prefs.edit()
                .putString(PREF_SERVER_URL, serverUrl)
                .putString(PREF_DEVICE_UUID, deviceUuid)
                .apply();
    }

    private void testConnection() {
        String serverUrl = serverUrlInput.getText().toString().trim();
        if (serverUrl.isEmpty()) {
            connectionResultText.setText("Enter a server URL first.");
            connectionResultText.setTextColor(Color.parseColor("#F2A83C"));
            return;
        }

        connectionResultText.setText("Testing...");
        connectionResultText.setTextColor(Color.parseColor("#9DB1C8"));

        ApiClient client = new ApiClient(serverUrl);
        client.checkHealth((reachable, detail) -> {
            if (!isAdded()) return;
            requireActivity().runOnUiThread(() -> {
                if (reachable) {
                    connectionResultText.setText("Connected to EDITH backend.");
                    connectionResultText.setTextColor(Color.parseColor("#42D9FF"));
                    saveServerSettings(serverUrl, deviceUuidInput.getText().toString().trim());
                } else {
                    connectionResultText.setText("Could not reach server: " + detail
                            + "\nCheck the URL and that the backend is running.");
                    connectionResultText.setTextColor(Color.parseColor("#EF4444"));
                }
            });
        });
    }

    private void switchCamera() {
        cameraFacing = (cameraFacing == CameraSelector.LENS_FACING_BACK)
                ? CameraSelector.LENS_FACING_FRONT : CameraSelector.LENS_FACING_BACK;
        prefs.edit().putInt(PREF_CAMERA_FACING, cameraFacing).apply();
        updateCameraFacingUi();

        if (spotting) {
            // Service is already running — tell it to switch lenses live,
            // no need to stop/restart spotting for this.
            Intent intent = new Intent(requireContext(), SpottingService.class);
            intent.setAction(SpottingService.ACTION_SWITCH_CAMERA);
            intent.putExtra(SpottingService.EXTRA_CAMERA_FACING, cameraFacing);
            requireContext().startService(intent);
        }
    }

    private void updateCameraFacingUi() {
        boolean back = cameraFacing == CameraSelector.LENS_FACING_BACK;
        cameraFacingText.setText(back ? R.string.using_back_camera : R.string.using_front_camera);
    }

    private void updateSpottingUi() {
        radarView.setActive(spotting);
        toggleButton.setText(spotting ? R.string.stop_spotting : R.string.start_spotting);
        spottingStateText.setText(spotting ? "SPOTTING ACTIVE" : "SPOTTING OFF");
    }

    private boolean hasPermissions() {
        for (String permission : requiredPermissions()) {
            if (ContextCompat.checkSelfPermission(requireContext(), permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private String[] requiredPermissions() {
        List<String> perms = new ArrayList<>();
        perms.add(Manifest.permission.CAMERA);
        perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        return perms.toArray(new String[0]);
    }

    private void requestPermissions() {
        // Requested together, once — every permission this app needs, in
        // a single prompt, rather than a multi-step gate.
        permissionLauncher.launch(requiredPermissions());
    }

    private void onPermissionsResult(Map<String, Boolean> results) {
        if (hasPermissions()) {
            startSpotting();
        } else {
            statusText.setText("Camera and location permissions are required to start spotting.");
        }
    }

    private void startSpotting() {
        String serverUrl = serverUrlInput.getText().toString().trim();
        String deviceUuid = deviceUuidInput.getText().toString().trim();

        if (serverUrl.isEmpty()) {
            statusText.setText("Enter the server URL first (e.g. https://your-space.hf.space).");
            return;
        }
        if (deviceUuid.isEmpty()) {
            deviceUuid = defaultDeviceName();
            deviceUuidInput.setText(deviceUuid);
        }
        saveServerSettings(serverUrl, deviceUuid);

        Intent serviceIntent = new Intent(requireContext(), SpottingService.class);
        serviceIntent.putExtra(SpottingService.EXTRA_SERVER_URL, serverUrl);
        serviceIntent.putExtra(SpottingService.EXTRA_DEVICE_UUID, deviceUuid);
        serviceIntent.putExtra(SpottingService.EXTRA_CAMERA_FACING, cameraFacing);
        ContextCompat.startForegroundService(requireContext(), serviceIntent);

        statsTracker.recordSessionStart();
        spotting = true;
        updateSpottingUi();
        statusText.setText("Spotting is ON. Notification bar shows \"EDITH Spotting Active\".\n"
                + "Only matches against people enrolled in active cases will be reported.");
    }

    private void stopSpotting() {
        Intent serviceIntent = new Intent(requireContext(), SpottingService.class);
        requireContext().stopService(serviceIntent);

        statsTracker.clearSessionStart();
        spotting = false;
        updateSpottingUi();
        statusText.setText("Spotting is OFF.");
    }
}
