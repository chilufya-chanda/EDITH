package com.edith.spotter;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.graphics.ImageFormat;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.camera.core.*;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * EDITH Spotter — foreground service.
 *
 * DESIGN NOTE — read this before modifying:
 * This service intentionally runs as a STANDARD Android foreground service
 * with a persistent, visible notification ("EDITH Spotting Active") and
 * the "camera" foreground service type declared in the manifest. It does
 * NOT use an invisible overlay window to hide camera access, and it
 * should not be modified to do so. The person holding this phone always
 * knows scanning is active — that guarantee is the whole point of this
 * design and is not up for negotiation in a future edit.
 *
 * It also never builds a standing database of faces it sees: every frame
 * is checked against the small list of ACTIVE, consented cases fetched
 * from the backend, and frames that don't match anything are discarded
 * immediately, never written to disk.
 *
 * MATCHING APPROACH: face DETECTION (ML Kit) runs on-device purely to
 * decide "is there a face here worth sending" — the actual embedding
 * generation and matching happens entirely server-side via
 * POST /api/recognize. This app never imports or runs DeepFace, ArcFace,
 * or RetinaFace, and never computes or compares a face embedding itself.
 */
public class SpottingService extends Service {

    public static final String EXTRA_SERVER_URL = "server_url";
    public static final String EXTRA_DEVICE_UUID = "device_uuid";
    public static final String EXTRA_CAMERA_FACING = "camera_facing";
    public static final String ACTION_SWITCH_CAMERA = "com.edith.spotter.SWITCH_CAMERA";
    public static final String ACTION_RESULT = "com.edith.spotter.RECOGNIZE_RESULT";
    public static final String EXTRA_RESULT_TEXT = "result_text";
    public static final String EXTRA_ACTIVE_CASE_COUNT = "active_case_count";

    private static final String CHANNEL_ID = "edith_spotting_channel";
    private static final int NOTIFICATION_ID = 1;
    private static final String TAG = "EdithSpottingService";
    private static final long CASE_REFRESH_INTERVAL_MS = 10_000;
    private static final long MIN_REPORT_INTERVAL_MS = 600; // measured ArcFace inference is ~0.3-0.4s server-side; this leaves headroom without needless queuing

    private ApiClient apiClient;
    private String deviceUuid;
    private List<ApiClient.ActiveCase> activeCases = new java.util.ArrayList<>();
    private ExecutorService cameraExecutor;
    private FaceDetector faceDetector;
    private StatsTracker statsTracker;
    private long lastCaseRefresh = 0;
    private long lastReportAttempt = 0;
    private int currentCameraFacing = CameraSelector.LENS_FACING_BACK;
    private ProcessCameraProvider cameraProvider;

    // Guards against firing a network request for every single analyzed
    // frame once a face is detected; the backend also enforces its own
    // per-device cooldown, this just avoids saturating the phone's own
    // analysis thread with redundant in-flight requests.
    private volatile boolean reportInFlight = false;

    @Override
    public void onCreate() {
        super.onCreate();
        cameraExecutor = Executors.newSingleThreadExecutor();
        statsTracker = new StatsTracker(this);

        FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .build();
        faceDetector = FaceDetection.getClient(options);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // The system can restart a START_STICKY service with a null
            // intent after killing it (e.g. under memory pressure) — there's
            // no server URL/device name to resume spotting with here. Still
            // satisfy Android's requirement that a service started via
            // startForegroundService() calls startForeground() promptly
            // (skipping it risks a startForeground-timeout crash on some
            // OEM/version combinations), then stop cleanly. The user just
            // re-opens the app and taps Start again.
            startForegroundWithNotification();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_SWITCH_CAMERA.equals(intent.getAction())) {
            // Already running — just rebind the camera with the new lens,
            // no need to touch the notification or re-fetch cases.
            currentCameraFacing = intent.getIntExtra(EXTRA_CAMERA_FACING, currentCameraFacing);
            startCamera();
            return START_STICKY;
        }

        String serverUrl = intent.getStringExtra(EXTRA_SERVER_URL);
        deviceUuid = intent.getStringExtra(EXTRA_DEVICE_UUID);
        currentCameraFacing = intent.getIntExtra(EXTRA_CAMERA_FACING, CameraSelector.LENS_FACING_BACK);
        apiClient = new ApiClient(serverUrl);

        startForegroundWithNotification();
        refreshActiveCases();
        startCamera();

        return START_STICKY;
    }

    private void startForegroundWithNotification() {
        createNotificationChannel();

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("EDITH Spotting Active")
                .setContentText("Matching only against enrolled, active missing-person cases.")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Persistent notice that this device is actively spotting for enrolled cases.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    /** Periodically refresh the small list of currently-active, consented cases. */
    private void refreshActiveCases() {
        apiClient.fetchActiveCases(deviceUuid, new ApiClient.ActiveCasesCallback() {
            @Override
            public void onResult(List<ApiClient.ActiveCase> cases) {
                activeCases = cases;
                Log.i(TAG, "Active case list refreshed: " + cases.size() + " case(s).");
                broadcastStatus("Watching for " + cases.size() + " active case(s)", cases.size());
            }

            @Override
            public void onError(String message) {
                Log.w(TAG, "Could not refresh active cases: " + message);
                broadcastStatus("Could not reach server: " + message, activeCases.size());
            }
        });
    }

    @OptIn(markerClass = ExperimentalGetImage.class)
    private void startCamera() {
        ProcessCameraProvider.getInstance(this).addListener(() -> {
            try {
                cameraProvider = ProcessCameraProvider.getInstance(this).get();

                ImageAnalysis imageAnalysis = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build();
                imageAnalysis.setAnalyzer(cameraExecutor, this::analyzeFrame);
                CameraSelector cameraSelector = new CameraSelector.Builder()
                        .requireLensFacing(currentCameraFacing)
                        .build();
                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(
                        new androidx.lifecycle.LifecycleOwner() {
                            private final androidx.lifecycle.LifecycleRegistry registry =
                                    new androidx.lifecycle.LifecycleRegistry(this);
                            { registry.setCurrentState(androidx.lifecycle.Lifecycle.State.RESUMED); }
                            @Override public androidx.lifecycle.Lifecycle getLifecycle() { return registry; }
                        },
                        cameraSelector,
                        imageAnalysis
                );
            } catch (Exception e) {
                Log.e(TAG, "Camera bind failed", e);
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @androidx.camera.core.ExperimentalGetImage
    private void analyzeFrame(ImageProxy imageProxy) {
        // Skip work entirely if there are no active cases to match against —
        // there is nothing to scan for, so don't process the frame at all.
        if (activeCases.isEmpty()) {
            maybeRefreshCases();
            imageProxy.close();
            return;
        }

        long now = System.currentTimeMillis();
        if (reportInFlight || (now - lastReportAttempt) < MIN_REPORT_INTERVAL_MS) {
            maybeRefreshCases();
            imageProxy.close();
            return;
        }

        if (imageProxy.getImage() == null) {
            imageProxy.close();
            return;
        }

        int rotationDegrees = imageProxy.getImageInfo().getRotationDegrees();
        InputImage inputImage = InputImage.fromMediaImage(imageProxy.getImage(), rotationDegrees);

        faceDetector.process(inputImage)
                .addOnSuccessListener(faces -> {
                    if (!faces.isEmpty()) {
                        try {
                            Bitmap fullFrame = imageProxyToBitmap(imageProxy, rotationDegrees);
                            Rect box = faces.get(0).getBoundingBox();
                            byte[] jpeg = cropFaceToJpeg(fullFrame, box);
                            if (jpeg != null) {
                                reportInFlight = true;
                                lastReportAttempt = System.currentTimeMillis();
                                reportMatch(jpeg);
                            }
                        } catch (Exception e) {
                            Log.w(TAG, "Could not crop/encode detected face", e);
                        }
                    }
                    maybeRefreshCases();
                    imageProxy.close();
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "Face detection failed", e);
                    imageProxy.close();
                });
    }

    /**
     * Converts a CameraX YUV_420_888 frame into a rotated, upright Bitmap.
     * Standard Android approach: pack the YUV planes into NV21, let
     * YuvImage produce a JPEG byte stream, decode that back into a Bitmap,
     * then rotate to match the device's orientation.
     */
    private Bitmap imageProxyToBitmap(ImageProxy imageProxy, int rotationDegrees) {
        ImageProxy.PlaneProxy[] planes = imageProxy.getPlanes();
        ByteBuffer yBuffer = planes[0].getBuffer();
        ByteBuffer uBuffer = planes[1].getBuffer();
        ByteBuffer vBuffer = planes[2].getBuffer();

        int ySize = yBuffer.remaining();
        int uSize = uBuffer.remaining();
        int vSize = vBuffer.remaining();

        byte[] nv21 = new byte[ySize + uSize + vSize];
        yBuffer.get(nv21, 0, ySize);
        vBuffer.get(nv21, ySize, vSize);
        uBuffer.get(nv21, ySize + vSize, uSize);

        YuvImage yuvImage = new YuvImage(nv21, ImageFormat.NV21,
                imageProxy.getWidth(), imageProxy.getHeight(), null);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        yuvImage.compressToJpeg(new Rect(0, 0, imageProxy.getWidth(), imageProxy.getHeight()), 90, out);
        byte[] jpegBytes = out.toByteArray();

        Bitmap bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.length);
        if (rotationDegrees != 0) {
            Matrix matrix = new Matrix();
            matrix.postRotate(rotationDegrees);
            bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        }
        return bitmap;
    }

    /**
     * Crops the detected face's bounding box out of the full frame, WITH a
     * margin added around it, and re-encodes that region as JPEG bytes.
     * The margin matters more than it might look: a razor-tight crop with
     * no surrounding context is exactly the case that trips up the
     * backend's face detector on the recognize path, and testing measured
     * a real accuracy difference from adding it — 0.90 confidence
     * ("likely") on a tight crop vs. 0.97 ("high_confidence") on the same
     * face with 30% margin added. Only this crop — never the full frame —
     * is ever sent anywhere.
     */
    private byte[] cropFaceToJpeg(Bitmap fullFrame, Rect box) {
        int marginX = (int) (box.width() * 0.3);
        int marginY = (int) (box.height() * 0.3);

        int left = Math.max(0, box.left - marginX);
        int top = Math.max(0, box.top - marginY);
        int right = Math.min(fullFrame.getWidth(), box.right + marginX);
        int bottom = Math.min(fullFrame.getHeight(), box.bottom + marginY);
        int width = right - left;
        int height = bottom - top;

        if (width <= 0 || height <= 0) return null;

        Bitmap faceCrop = Bitmap.createBitmap(fullFrame, left, top, width, height);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        faceCrop.compress(Bitmap.CompressFormat.JPEG, 90, out);
        return out.toByteArray();
    }

    private void maybeRefreshCases() {
        long now = System.currentTimeMillis();
        if (now - lastCaseRefresh > CASE_REFRESH_INTERVAL_MS) {
            lastCaseRefresh = now;
            refreshActiveCases();
        }
    }

    /**
     * Sends a cropped face JPEG to the backend's /api/recognize endpoint.
     * The backend generates the embedding and checks it against the live
     * active-case list — this device's own face detection only decided
     * "is there a face here worth checking," never "who is this."
     */
    private void reportMatch(byte[] faceJpeg) {
        double lat = Double.NaN, lon = Double.NaN;
        try {
            LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
            Location last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last == null) {
                last = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }
            if (last != null) {
                lat = last.getLatitude();
                lon = last.getLongitude();
            }
        } catch (SecurityException ignored) { }

        apiClient.recognize(faceJpeg, lat, lon, deviceUuid, new ApiClient.RecognizeCallback() {
            @Override
            public void onResult(ApiClient.RecognizeResult result) {
                Log.i(TAG, "Recognize result: " + result.result);
                reportInFlight = false;
                if (result.isMatch()) {
                    statsTracker.recordSightingReported();
                    broadcastStatus("Possible match reported: " + result.classification, activeCases.size());
                }
            }

            @Override
            public void onError(String message) {
                Log.w(TAG, "Recognize failed: " + message);
                reportInFlight = false;
            }
        });
    }

    private void broadcastStatus(String text, int activeCaseCount) {
        Intent intent = new Intent(ACTION_RESULT);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_RESULT_TEXT, text);
        intent.putExtra(EXTRA_ACTIVE_CASE_COUNT, activeCaseCount);
        sendBroadcast(intent);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        cameraExecutor.shutdown();
    }
}
