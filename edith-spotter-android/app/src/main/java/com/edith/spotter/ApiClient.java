package com.edith.spotter;

import android.util.Log;
import okhttp3.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Talks to the EDITH FastAPI backend.
 *
 * Only ever fetches the ACTIVE case list (consented, currently-searched-for
 * people — {@code GET /api/cases/active}, deliberately unauthenticated on
 * the backend, same trust model as the rest of this project) and reports
 * candidate matches against that list via {@code POST /api/recognize}.
 * There is no endpoint here that touches a standing database of the
 * public, and this app never computes a face embedding itself — the
 * backend does that.
 */
public class ApiClient {

    private static final String TAG = "EdithApiClient";
    private final OkHttpClient client;
    private final String baseUrl;

    public ApiClient(String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.client = new OkHttpClient.Builder()
                .connectTimeout(6, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .build();
    }

    public interface HealthCallback {
        void onResult(boolean reachable, String detail);
    }

    /** Used by the "Test Connection" button — quick GET to confirm the backend is reachable. */
    public void checkHealth(HealthCallback callback) {
        Request request = new Request.Builder()
                .url(baseUrl + "/api/health")
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                callback.onResult(false, e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) {
                try (ResponseBody ignored = response.body()) {
                    callback.onResult(response.isSuccessful(), "HTTP " + response.code());
                }
            }
        });
    }

    public interface ActiveCasesCallback {
        void onResult(List<ActiveCase> cases);
        void onError(String message);
    }

    public interface RecognizeCallback {
        void onResult(RecognizeResult result);
        void onError(String message);
    }

    /** Pulls only the currently active, consented case list. No auth required — same as the backend route.
     *  Passing deviceUuid also registers a heartbeat server-side (see /api/cases/active), which is what
     *  makes this device show up in the dashboard's connected-device count even before it's found a match. */
    public void fetchActiveCases(String deviceUuid, ActiveCasesCallback callback) {
        HttpUrl url = HttpUrl.parse(baseUrl + "/api/cases/active").newBuilder()
                .addQueryParameter("device_uuid", deviceUuid)
                .build();
        Request request = new Request.Builder()
                .url(url)
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.w(TAG, "fetchActiveCases failed", e);
                callback.onError(e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) {
                try (ResponseBody body = response.body()) {
                    if (!response.isSuccessful() || body == null) {
                        callback.onError("HTTP " + response.code());
                        return;
                    }
                    String bodyString = body.string();
                    try {
                        JSONArray arr = new JSONArray(bodyString);
                        List<ActiveCase> cases = new ArrayList<>();
                        for (int i = 0; i < arr.length(); i++) {
                            JSONObject obj = arr.getJSONObject(i);
                            // The backend deliberately never includes the embedding in
                            // this response — matching happens entirely server-side via
                            // /api/recognize, so this device never needs or receives raw
                            // biometric vectors at all, even though this endpoint is public.
                            ActiveCase c = new ActiveCase();
                            c.caseId = obj.getString("case_id");
                            c.fullName = obj.getString("full_name");
                            c.geofenceLat = obj.isNull("geofence_lat") ? Double.NaN : obj.optDouble("geofence_lat");
                            c.geofenceLon = obj.isNull("geofence_lon") ? Double.NaN : obj.optDouble("geofence_lon");
                            c.geofenceRadiusMeters = obj.isNull("geofence_radius_meters")
                                    ? Double.NaN : obj.optDouble("geofence_radius_meters");
                            cases.add(c);
                        }
                        callback.onResult(cases);
                    } catch (Exception e) {
                        callback.onError("parse error: " + e.getMessage());
                    }
                }
            }
        });
    }

    /**
     * Reports a candidate match by uploading the cropped face image itself
     * to {@code POST /api/recognize}. The backend generates the embedding
     * server-side and matches it against the active case list — this app
     * never touches DeepFace/ArcFace/RetinaFace or any embedding directly.
     */
    public void recognize(byte[] jpegBytes, double lat, double lon, String deviceUuid, RecognizeCallback callback) {
        RequestBody imageBody = RequestBody.create(jpegBytes, MediaType.get("image/jpeg"));
        MultipartBody.Builder builder = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("face_image", "face.jpg", imageBody)
                .addFormDataPart("device_uuid", deviceUuid);
        if (!Double.isNaN(lat) && !Double.isNaN(lon)) {
            builder.addFormDataPart("latitude", String.valueOf(lat));
            builder.addFormDataPart("longitude", String.valueOf(lon));
        }

        Request request = new Request.Builder()
                .url(baseUrl + "/api/recognize")
                .post(builder.build())
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                callback.onError(e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) {
                try (ResponseBody body = response.body()) {
                    String bodyString = body != null ? body.string() : "{}";
                    try {
                        JSONObject obj = new JSONObject(bodyString);
                        RecognizeResult result = new RecognizeResult();
                        result.result = obj.optString("result", "unknown");
                        result.classification = obj.optString("classification", null);
                        result.confidence = obj.has("confidence") && !obj.isNull("confidence")
                                ? obj.optDouble("confidence") : Double.NaN;
                        callback.onResult(result);
                    } catch (Exception e) {
                        callback.onError("parse error: " + e.getMessage());
                    }
                }
            }
        });
    }

    public static class ActiveCase {
        public String caseId;
        public String fullName;
        public double geofenceLat = Double.NaN;
        public double geofenceLon = Double.NaN;
        public double geofenceRadiusMeters = Double.NaN;

        public boolean hasGeofence() {
            return !Double.isNaN(geofenceLat) && !Double.isNaN(geofenceRadiusMeters);
        }
    }

    public static class RecognizeResult {
        public String result; // match | no_match | no_face_detected | no_active_cases | cooldown
        public String classification; // possible | likely | high_confidence, or null
        public double confidence; // NaN if not present

        public boolean isMatch() {
            return "match".equals(result);
        }
    }
}
