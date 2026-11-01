import 'dart:math' as math;

/// Opposite faces on the cube: 0↔3, 1↔4, 2↔5.
const faceOpposite = <int>[3, 4, 5, 0, 1, 2];

/// Counter-rotation (radians) so on-screen digits stay upright vs gravity
/// when the phone is tilted left/right/up/down. Returns null when flat
/// (caller should keep the previous angle).
double? uprightCorrectionRad(double x, double y, double z) {
  final ax = x.abs();
  final ay = y.abs();
  final az = z.abs();
  // Flat on table — don't twist the UI.
  if (az >= ax && az >= ay && az >= 6.5) return null;
  if (ax < 2.2 && ay < 2.2) return null;
  final roll = math.atan2(x, y);
  final quarter = (roll / (math.pi / 2)).round();
  return -quarter * (math.pi / 2);
}

/// Maps gravity (accelerometer, m/s²) to the cube face resting on the table
/// (pointing DOWN). Returns null unless the phone is nearly flat on one face,
/// so holding it to look at the screen does not change the timer.
int? faceFromAccel(
  double x,
  double y,
  double z, {
  double minG = 7.8,
  double maxOther = 3.8,
}) {
  final ax = x.abs();
  final ay = y.abs();
  final az = z.abs();

  // Android at rest: vector points "up" (opposite gravity). Down face = opposite.
  int? up;
  if (az >= ax && az >= ay && az >= minG && ax <= maxOther && ay <= maxOther) {
    up = z > 0 ? 0 : 3; // screen up / screen down
  } else if (ax >= ay && ax >= az && ax >= minG && ay <= maxOther && az <= maxOther) {
    up = x > 0 ? 1 : 4; // right up / left up
  } else if (ay >= ax && ay >= az && ay >= minG && ax <= maxOther && az <= maxOther) {
    up = y > 0 ? 2 : 5; // top up / bottom up
  }
  if (up == null) return null;
  return faceOpposite[up];
}

/// Debounces noisy accelerometer samples until a face stays stable.
class FaceSettler {
  FaceSettler({
    this.settleFor = const Duration(milliseconds: 550),
    DateTime Function()? clock,
  }) : clock = clock ?? DateTime.now;

  final Duration settleFor;
  final DateTime Function() clock;

  int? _candidate;
  DateTime? _since;
  int? current;

  /// Face currently being held, not yet settled (or null).
  int? get candidate => _candidate;

  /// Returns a newly settled face, or null if nothing changed.
  int? ingest(int? face) {
    if (face == null) {
      _candidate = null;
      _since = null;
      return null;
    }
    if (face == current) {
      _candidate = face;
      _since = clock();
      return null;
    }
    if (face != _candidate) {
      _candidate = face;
      _since = clock();
      return null;
    }
    final started = _since;
    if (started == null) return null;
    if (clock().difference(started) < settleFor) return null;
    current = face;
    return face;
  }
}
