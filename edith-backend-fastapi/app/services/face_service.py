"""
Face embedding + matching service. This is the ONLY module in the entire
project that imports DeepFace. Neither the React app, the Flutter app, nor
any other backend module talks to DeepFace/ArcFace/RetinaFace directly —
everything goes through the functions in this file, called from routes.

Detector defaults to "opencv" (bundled inside opencv-python, zero network
dependency) rather than RetinaFace or YuNet — both of those download a
weight file from a third party at first use, and YuNet's in particular is
served through a Git-LFS-backed path that has been observed to silently
return a corrupt stub file on some networks, which then detects zero
faces with no obvious error. Set EDITH_FACE_DETECTOR in your environment
to trade this reliability for RetinaFace/YuNet's better accuracy on
difficult angles, once you've confirmed the download works cleanly in
your actual deployment environment.
"""

import numpy as np
import cv2
import threading

from app.config import get_settings

settings = get_settings()

try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False

# DeepFace/TensorFlow's first model load isn't guaranteed thread-safe —
# two requests (or the startup warmup thread racing a real request)
# calling DeepFace.represent() for the first time concurrently can
# intermittently fail. This lock only matters until the model is loaded
# once and cached; it doesn't meaningfully throttle steady-state traffic.
_model_lock = threading.Lock()


class NoFaceDetectedError(Exception):
    """Raised when no face could be detected in the supplied image."""


class ModelUnavailableError(Exception):
    """Raised when DeepFace itself isn't installed/loadable — a deploy/config problem, not a bad photo."""


def _require_deepface():
    if not DEEPFACE_AVAILABLE:
        raise ModelUnavailableError("DeepFace is not installed. Run: pip install -r requirements.txt")


def generate_embedding_from_path(image_path: str) -> list[float]:
    """Used by enrollment, which handles one photo at a time — not latency sensitive."""
    _require_deepface()
    try:
        with _model_lock:
            result = DeepFace.represent(
                img_path=image_path,
                model_name=settings.FACE_MODEL_NAME,
                detector_backend=settings.FACE_DETECTOR_BACKEND,
                enforce_detection=True,
                align=True,
            )
    except Exception as e:
        raise NoFaceDetectedError(str(e))
    return result[0]["embedding"]


def generate_embedding_from_bytes(image_bytes: bytes, allow_fallback: bool = False) -> list[float]:
    """
    Used by the recognize/verify hot path — decodes straight from memory,
    never touches disk, so every spotter frame avoids two filesystem
    round-trips it doesn't need.

    allow_fallback=True (used by the recognize route, where the client has
    already located a face on-device) tries real detection+alignment
    first — better match accuracy when it works — and only falls back to
    a raw, unaligned embedding (detector_backend="skip") if real detection
    fails on the crop. This matters because a tight, already-cropped face
    image is exactly the case classic detectors like Haar cascades handle
    worst (little surrounding context), and dead-ending into
    "no_face_detected" on a crop the client already confirmed has a face
    in it produces exactly the "point the camera at someone and nothing
    happens" failure mode — worth trading a little accuracy to avoid.
    Enrollment/verify (allow_fallback=False, the default) always require
    real detection succeeding, since those receive full uncropped photos
    where a detection failure usually means there genuinely isn't a
    clear, usable face — silently falling back would hide that.
    """
    _require_deepface()
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise NoFaceDetectedError("could not decode image bytes")

    try:
        with _model_lock:
            result = DeepFace.represent(
                img_path=img,
                model_name=settings.FACE_MODEL_NAME,
                detector_backend=settings.FACE_DETECTOR_BACKEND,
                enforce_detection=True,
                align=True,
            )
        return result[0]["embedding"]
    except Exception as first_error:
        if not allow_fallback:
            raise NoFaceDetectedError(str(first_error))

    # Real detection failed on this crop — fall back to treating the whole
    # image as the face (no alignment), rather than giving up entirely.
    try:
        with _model_lock:
            result = DeepFace.represent(
                img_path=img,
                model_name=settings.FACE_MODEL_NAME,
                detector_backend="skip",
                enforce_detection=False,
                align=False,
            )
        return result[0]["embedding"]
    except Exception as fallback_error:
        raise NoFaceDetectedError(str(fallback_error))


def cosine_similarity(vec_a, vec_b) -> float:
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def classify_score(score: float) -> str:
    if score < settings.MATCH_THRESHOLD_POSSIBLE:
        return "no_match"
    if score < settings.MATCH_THRESHOLD_LIKELY:
        return "possible"
    if score < settings.MATCH_THRESHOLD_HIGH:
        return "likely"
    return "high_confidence"


def find_best_match(incoming_embedding: list[float], active_cases: list[dict]):
    """
    Vectorized 1:N match against every active case at once.
    `active_cases` items need "case_id", "full_name", "embedding".
    Returns (case_id, full_name, score, classification) or None.
    """
    if not active_cases:
        return None

    incoming = np.array(incoming_embedding, dtype=np.float32)
    incoming_norm = incoming / (np.linalg.norm(incoming) + 1e-9)

    matrix = np.array([c["embedding"] for c in active_cases], dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-9
    matrix_norm = matrix / norms

    scores = matrix_norm @ incoming_norm
    best_idx = int(np.argmax(scores))
    best_score = float(scores[best_idx])

    classification = classify_score(best_score)
    if classification == "no_match":
        return None

    best_case = active_cases[best_idx]
    return best_case["case_id"], best_case["full_name"], best_score, classification


def verify_against_case(incoming_embedding: list[float], case_embedding: list[float]):
    """1:1 verification — used by /api/verify to confirm a specific case, not search all of them."""
    score = cosine_similarity(incoming_embedding, case_embedding)
    classification = classify_score(score)
    return score, classification
