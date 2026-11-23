/**
 * Match-found alarm: a synthesized two-tone alert sound (Web Audio API —
 * no external audio file to host or fail to load) followed by a spoken
 * announcement (Web Speech API's SpeechSynthesis, built into every modern
 * browser, no external service or API key required).
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

/** A short, distinct two-tone alert chime — deliberately not a generic beep. */
export function playAlarm() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;
  [880, 660].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const start = now + i * 0.22;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + 0.2);

    osc.start(start);
    osc.stop(start + 0.22);
  });
}

/** Speaks a short announcement. Silently does nothing if the browser doesn't support it. */
export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

/**
 * The full match-found sequence: alarm tone, then the spoken line once the
 * location name is known (or immediately with coordinates if the location
 * lookup hasn't resolved yet — see services/geocode.js).
 */
export function announceMatch(fullName, locationLabel) {
  playAlarm();
  const line = locationLabel
    ? `Attention. Target for case ${fullName} has been located in ${locationLabel}.`
    : `Attention. Target for case ${fullName} has been located.`;
  // Small delay so the spoken line doesn't overlap the alarm tone.
  setTimeout(() => speak(line), 500);
}
