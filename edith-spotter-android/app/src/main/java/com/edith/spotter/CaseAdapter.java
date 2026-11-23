package com.edith.spotter;

import android.animation.ObjectAnimator;
import android.location.Location;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class CaseAdapter extends RecyclerView.Adapter<CaseAdapter.CaseViewHolder> {

    private final List<ApiClient.ActiveCase> cases = new ArrayList<>();
    private Location deviceLocation; // may be null — distance/relevance simply isn't shown then

    public void submitList(List<ApiClient.ActiveCase> newCases) {
        cases.clear();
        cases.addAll(newCases);
        notifyDataSetChanged();
    }

    public void setDeviceLocation(Location location) {
        this.deviceLocation = location;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public CaseViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_case, parent, false);
        return new CaseViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull CaseViewHolder holder, int position) {
        ApiClient.ActiveCase c = cases.get(position);
        holder.name.setText(c.fullName);
        holder.caseId.setText(c.caseId);

        if (!c.hasGeofence()) {
            holder.relevance.setText(R.string.cases_everywhere);
            holder.relevance.setTextColor(holder.itemView.getResources().getColor(R.color.text_dim));
            holder.distance.setText("");
        } else if (deviceLocation != null) {
            float[] result = new float[1];
            Location.distanceBetween(deviceLocation.getLatitude(), deviceLocation.getLongitude(),
                    c.geofenceLat, c.geofenceLon, result);
            float distanceMeters = result[0];
            boolean near = distanceMeters <= c.geofenceRadiusMeters;

            holder.relevance.setText(near ? R.string.cases_near_you : R.string.cases_elsewhere);
            holder.relevance.setTextColor(holder.itemView.getResources().getColor(near ? R.color.cyan : R.color.text_mute));
            holder.distance.setText(formatDistance(distanceMeters));
        } else {
            holder.relevance.setText(R.string.cases_everywhere);
            holder.relevance.setTextColor(holder.itemView.getResources().getColor(R.color.text_dim));
            holder.distance.setText("");
        }

        // Staggered fade+rise entrance — a small but real polish touch,
        // not a flat instant list. Only animates on first bind of the
        // view (recycled views re-binding on scroll won't re-fire it,
        // since Android reuses the same holder/view instance).
        if (holder.itemView.getTag() == null) {
            holder.itemView.setTag(true);
            holder.itemView.setAlpha(0f);
            holder.itemView.setTranslationY(24f);
            ObjectAnimator.ofFloat(holder.itemView, "alpha", 0f, 1f).setDuration(260).start();
            ObjectAnimator anim = ObjectAnimator.ofFloat(holder.itemView, "translationY", 24f, 0f);
            anim.setDuration(260);
            anim.setStartDelay((long) position * 40L);
            anim.start();
        }
    }

    private String formatDistance(float meters) {
        if (meters >= 1000) {
            return String.format(Locale.US, "%.1f km away", meters / 1000f);
        }
        return String.format(Locale.US, "%d m away", (int) meters);
    }

    @Override
    public int getItemCount() {
        return cases.size();
    }

    static class CaseViewHolder extends RecyclerView.ViewHolder {
        TextView name, caseId, relevance, distance;

        CaseViewHolder(View itemView) {
            super(itemView);
            name = itemView.findViewById(R.id.caseName);
            caseId = itemView.findViewById(R.id.caseIdText);
            relevance = itemView.findViewById(R.id.caseRelevance);
            distance = itemView.findViewById(R.id.caseDistance);
        }
    }
}
