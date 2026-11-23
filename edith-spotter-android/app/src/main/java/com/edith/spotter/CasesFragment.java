package com.edith.spotter;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.util.List;

public class CasesFragment extends Fragment {

    private static final String PREFS_NAME = "edith_spotter_prefs";
    private static final String PREF_SERVER_URL = "server_url";

    private RecyclerView recyclerView;
    private TextView emptyText;
    private SwipeRefreshLayout swipeRefresh;
    private CaseAdapter adapter;
    private StatsTracker statsTracker;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_cases, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        statsTracker = new StatsTracker(requireContext());
        recyclerView = view.findViewById(R.id.casesRecyclerView);
        emptyText = view.findViewById(R.id.casesEmptyText);
        swipeRefresh = view.findViewById(R.id.swipeRefresh);

        adapter = new CaseAdapter();
        recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
        recyclerView.setAdapter(adapter);

        swipeRefresh.setColorSchemeColors(0xFF42D9FF);
        swipeRefresh.setOnRefreshListener(this::loadCases);

        loadCases();
    }

    @Override
    public void onResume() {
        super.onResume();
        loadCases(); // pick up any server-url change made on the Home tab since last visit
    }

    private String getServerUrl() {
        SharedPreferences prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(PREF_SERVER_URL, "");
    }

    private void loadCases() {
        String serverUrl = getServerUrl();
        if (serverUrl.isEmpty()) {
            swipeRefresh.setRefreshing(false);
            showEmpty(true);
            return;
        }

        ApiClient client = new ApiClient(serverUrl);
        client.fetchActiveCases("cases-tab-view", new ApiClient.ActiveCasesCallback() {
            @Override
            public void onResult(List<ApiClient.ActiveCase> cases) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    adapter.submitList(cases);
                    adapter.setDeviceLocation(getLastKnownLocation());
                    showEmpty(cases.isEmpty());
                    swipeRefresh.setRefreshing(false);
                    statsTracker.recordSync(cases.size());
                });
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    swipeRefresh.setRefreshing(false);
                    showEmpty(true);
                });
            }
        });
    }

    private void showEmpty(boolean empty) {
        emptyText.setVisibility(empty ? View.VISIBLE : View.GONE);
        recyclerView.setVisibility(empty ? View.GONE : View.VISIBLE);
    }

    @Nullable
    private Location getLastKnownLocation() {
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        try {
            LocationManager lm = (LocationManager) requireContext().getSystemService(Context.LOCATION_SERVICE);
            Location last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last == null) last = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            return last;
        } catch (SecurityException e) {
            return null;
        }
    }
}
