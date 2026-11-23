package com.edith.spotter;

import android.os.Bundle;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentTransaction;
import com.google.android.material.bottomnavigation.BottomNavigationView;

/**
 * EDITH Spotter — host activity.
 *
 * Three tabs: HOME (spotting control), CASES (what's currently being
 * searched for), STATS (this device's own activity). Deliberately plain
 * fragment swapping rather than the Navigation Component library — three
 * static tabs don't need a nav graph, and this keeps the dependency
 * surface smaller and easier to reason about without a compiler to check it.
 */
public class MainActivity extends AppCompatActivity {

    private final Fragment homeFragment = new HomeFragment();
    private final Fragment casesFragment = new CasesFragment();
    private final Fragment statsFragment = new StatsFragment();
    private Fragment activeFragment = homeFragment;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        if (savedInstanceState == null) {
            getSupportFragmentManager().beginTransaction()
                    .add(R.id.fragmentContainer, statsFragment, "stats").hide(statsFragment)
                    .add(R.id.fragmentContainer, casesFragment, "cases").hide(casesFragment)
                    .add(R.id.fragmentContainer, homeFragment, "home")
                    .commit();
        }

        BottomNavigationView bottomNav = findViewById(R.id.bottomNav);
        bottomNav.setOnItemSelectedListener(this::onNavItemSelected);
    }

    private boolean onNavItemSelected(@NonNull android.view.MenuItem item) {
        Fragment target;
        int id = item.getItemId();
        if (id == R.id.nav_home) {
            target = homeFragment;
        } else if (id == R.id.nav_cases) {
            target = casesFragment;
        } else if (id == R.id.nav_stats) {
            target = statsFragment;
        } else {
            return false;
        }

        if (target == activeFragment) return true;

        FragmentTransaction tx = getSupportFragmentManager().beginTransaction();
        tx.setCustomAnimations(
                android.R.anim.fade_in, android.R.anim.fade_out,
                android.R.anim.fade_in, android.R.anim.fade_out
        );
        tx.hide(activeFragment).show(target).commit();
        activeFragment = target;
        return true;
    }
}
