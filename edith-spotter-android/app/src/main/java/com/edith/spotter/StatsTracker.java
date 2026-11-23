package com.edith.spotter;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Tracks this device's own spotting activity locally — sightings it has
 * reported, when its current spotting session started, and when it last
 * successfully talked to the backend. All real, persisted counters
 * (SharedPreferences), not mocked numbers — incremented from
 * SpottingService as things actually happen.
 */
public class StatsTracker {

    private static final String PREFS_NAME = "edith_spotter_stats";
    private static final String KEY_TOTAL_SIGHTINGS = "total_sightings";
    private static final String KEY_SESSION_START = "session_start_ms";
    private static final String KEY_LAST_SYNC = "last_sync_ms";
    private static final String KEY_LAST_ACTIVE_CASE_COUNT = "last_active_case_count";

    private final SharedPreferences prefs;

    public StatsTracker(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public void recordSightingReported() {
        int current = prefs.getInt(KEY_TOTAL_SIGHTINGS, 0);
        prefs.edit().putInt(KEY_TOTAL_SIGHTINGS, current + 1).apply();
    }

    public int getTotalSightings() {
        return prefs.getInt(KEY_TOTAL_SIGHTINGS, 0);
    }

    public void recordSessionStart() {
        prefs.edit().putLong(KEY_SESSION_START, System.currentTimeMillis()).apply();
    }

    public void clearSessionStart() {
        prefs.edit().remove(KEY_SESSION_START).apply();
    }

    /** -1 if no session is currently active. */
    public long getSessionUptimeMs() {
        long start = prefs.getLong(KEY_SESSION_START, -1);
        return start < 0 ? -1 : System.currentTimeMillis() - start;
    }

    public boolean isSessionActive() {
        return prefs.getLong(KEY_SESSION_START, -1) >= 0;
    }

    public void recordSync(int activeCaseCount) {
        prefs.edit()
                .putLong(KEY_LAST_SYNC, System.currentTimeMillis())
                .putInt(KEY_LAST_ACTIVE_CASE_COUNT, activeCaseCount)
                .apply();
    }

    /** -1 if never synced. */
    public long getLastSyncMs() {
        return prefs.getLong(KEY_LAST_SYNC, -1);
    }

    public int getLastActiveCaseCount() {
        return prefs.getInt(KEY_LAST_ACTIVE_CASE_COUNT, 0);
    }
}
