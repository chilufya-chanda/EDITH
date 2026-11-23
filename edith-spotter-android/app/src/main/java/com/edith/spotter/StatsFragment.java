package com.edith.spotter;

import android.animation.ValueAnimator;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

public class StatsFragment extends Fragment {

    private StatsTracker statsTracker;
    private TextView sightingsValue, activeCasesValue, uptimeValue, lastSyncValue;
    private final Handler uptimeHandler = new Handler(Looper.getMainLooper());
    private Runnable uptimeTicker;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_stats, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        statsTracker = new StatsTracker(requireContext());

        bindCardLabel(view, R.id.cardSightings, R.string.stats_sightings);
        bindCardLabel(view, R.id.cardActiveCases, R.string.stats_active_cases);
        bindCardLabel(view, R.id.cardUptime, R.string.stats_uptime);
        bindCardLabel(view, R.id.cardLastSync, R.string.stats_last_sync);

        sightingsValue = view.findViewById(R.id.cardSightings).findViewById(R.id.statValue);
        activeCasesValue = view.findViewById(R.id.cardActiveCases).findViewById(R.id.statValue);
        uptimeValue = view.findViewById(R.id.cardUptime).findViewById(R.id.statValue);
        lastSyncValue = view.findViewById(R.id.cardLastSync).findViewById(R.id.statValue);
    }

    @Override
    public void onResume() {
        super.onResume();
        animateCountUp(sightingsValue, statsTracker.getTotalSightings());
        animateCountUp(activeCasesValue, statsTracker.getLastActiveCaseCount());
        updateLastSyncText();
        startUptimeTicker();
    }

    @Override
    public void onPause() {
        super.onPause();
        stopUptimeTicker();
    }

    private void bindCardLabel(View root, int cardId, int stringRes) {
        TextView label = root.findViewById(cardId).findViewById(R.id.statLabel);
        label.setText(stringRes);
    }

    /** Small but real polish: numbers count up from 0 on reveal rather than just appearing. */
    private void animateCountUp(TextView target, int finalValue) {
        ValueAnimator animator = ValueAnimator.ofInt(0, finalValue);
        animator.setDuration(700);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(a -> target.setText(String.valueOf((int) a.getAnimatedValue())));
        animator.start();
    }

    private void updateLastSyncText() {
        long lastSync = statsTracker.getLastSyncMs();
        if (lastSync < 0) {
            lastSyncValue.setText(R.string.stats_never);
            return;
        }
        SimpleDateFormat format = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());
        lastSyncValue.setText(format.format(lastSync));
    }

    private void startUptimeTicker() {
        uptimeTicker = new Runnable() {
            @Override
            public void run() {
                if (!isAdded()) return;
                uptimeValue.setText(formatUptime(statsTracker.getSessionUptimeMs()));
                uptimeHandler.postDelayed(this, 1000);
            }
        };
        uptimeHandler.post(uptimeTicker);
    }

    private void stopUptimeTicker() {
        if (uptimeTicker != null) uptimeHandler.removeCallbacks(uptimeTicker);
    }

    private String formatUptime(long ms) {
        if (ms < 0) return "00:00:00";
        long h = TimeUnit.MILLISECONDS.toHours(ms);
        long m = TimeUnit.MILLISECONDS.toMinutes(ms) % 60;
        long s = TimeUnit.MILLISECONDS.toSeconds(ms) % 60;
        return String.format(Locale.US, "%02d:%02d:%02d", h, m, s);
    }
}
