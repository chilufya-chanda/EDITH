package com.edith.spotter;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.util.AttributeSet;
import android.view.View;
import android.view.animation.LinearInterpolator;

/**
 * A rotating radar-sweep animation — concentric rings with a glowing
 * gradient sweep arc rotating continuously behind it, echoing the
 * dashboard's own radar-sweep/scan-ring motif so the whole EDITH system
 * (web + mobile) reads as one visual language rather than two unrelated
 * apps.
 *
 * Pure Canvas + ValueAnimator — no external animation library, nothing
 * that can fail to resolve at build time.
 */
public class RadarSweepView extends View {

    private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sweepPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint centerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF bounds = new RectF();

    private float sweepAngle = 0f;
    private ValueAnimator sweepAnimator;
    private boolean active = true;

    public RadarSweepView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeWidth(2f);
        ringPaint.setColor(Color.parseColor("#1E3A52"));

        centerPaint.setStyle(Paint.Style.FILL);
        centerPaint.setColor(Color.parseColor("#42D9FF"));

        sweepPaint.setStyle(Paint.Style.FILL);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        float pad = ringPaint.getStrokeWidth();
        bounds.set(pad, pad, w - pad, h - pad);

        // Gradient sweep: bright at the leading edge, fading to transparent
        // behind it — this is what reads as "a beam rotating," not just a
        // spinning solid wedge.
        int cyan = Color.parseColor("#42D9FF");
        int transparentCyan = Color.argb(0, 0x42, 0xD9, 0xFF);
        SweepGradient gradient = new SweepGradient(
                w / 2f, h / 2f,
                new int[]{transparentCyan, transparentCyan, Color.argb(60, 0x42, 0xD9, 0xFF), cyan},
                new float[]{0f, 0.72f, 0.92f, 1f}
        );
        sweepPaint.setShader(gradient);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        startAnimating();
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        stopAnimating();
    }

    private void startAnimating() {
        if (sweepAnimator != null) return;
        sweepAnimator = ValueAnimator.ofFloat(0f, 360f);
        sweepAnimator.setDuration(3400);
        sweepAnimator.setRepeatCount(ValueAnimator.INFINITE);
        sweepAnimator.setInterpolator(new LinearInterpolator());
        sweepAnimator.addUpdateListener(anim -> {
            sweepAngle = (float) anim.getAnimatedValue();
            invalidate();
        });
        sweepAnimator.start();
    }

    private void stopAnimating() {
        if (sweepAnimator != null) {
            sweepAnimator.cancel();
            sweepAnimator = null;
        }
    }

    /** Dims the whole view (still spinning) when spotting is off, so it visually reads as "idle." */
    public void setActive(boolean active) {
        this.active = active;
        centerPaint.setColor(active ? Color.parseColor("#42D9FF") : Color.parseColor("#6B7F96"));
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float cx = getWidth() / 2f;
        float cy = getHeight() / 2f;
        float maxRadius = Math.min(cx, cy) - ringPaint.getStrokeWidth();

        int alpha = active ? 255 : 90;

        // Concentric rings.
        for (int i = 1; i <= 3; i++) {
            ringPaint.setAlpha(alpha / i);
            canvas.drawCircle(cx, cy, maxRadius * i / 3f, ringPaint);
        }

        // Rotating gradient sweep.
        canvas.save();
        canvas.rotate(sweepAngle, cx, cy);
        sweepPaint.setAlpha(alpha);
        canvas.drawCircle(cx, cy, maxRadius, sweepPaint);
        canvas.restore();

        // Center dot.
        centerPaint.setAlpha(alpha);
        canvas.drawCircle(cx, cy, 10f, centerPaint);
    }
}
