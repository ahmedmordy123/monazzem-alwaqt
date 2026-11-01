import 'package:flutter_test/flutter_test.dart';
import 'package:monazzem/engine/face_detector.dart';

void main() {
  test('maps table-down faces from gravity', () {
    // Screen up → back on table (face 3)
    expect(faceFromAccel(0, 0, 9.8), 3);
    // Screen down → front on table (face 0)
    expect(faceFromAccel(0, 0, -9.8), 0);
    // Right edge down
    expect(faceFromAccel(9.8, 0, 0), 4);
    // Left edge down
    expect(faceFromAccel(-9.8, 0, 0), 1);
    // Top edge down
    expect(faceFromAccel(0, 9.8, 0), 5);
    // Bottom edge down
    expect(faceFromAccel(0, -9.8, 0), 2);
  });

  test('ignores handheld tilted angles', () {
    expect(faceFromAccel(4, 7, 3), isNull);
    expect(faceFromAccel(5, 5, 5), isNull);
    expect(faceFromAccel(9.8, 5, 0), isNull);
  });

  test('upright correction snaps to quarter turns', () {
    expect(uprightCorrectionRad(0, 9.8, 0), 0);
    expect(uprightCorrectionRad(9.8, 0, 0), closeTo(-1.5708, 0.01));
    expect(uprightCorrectionRad(-9.8, 0, 0), closeTo(1.5708, 0.01));
    expect(uprightCorrectionRad(0, -9.8, 0), closeTo(-3.1416, 0.01));
    // Flat → keep previous
    expect(uprightCorrectionRad(0, 0, 9.8), isNull);
  });

  test('settler waits before accepting a new face', () {
    var now = DateTime.utc(2026, 1, 1);
    final settler = FaceSettler(
      settleFor: const Duration(milliseconds: 400),
      clock: () => now,
    );

    expect(settler.ingest(1), isNull);
    now = now.add(const Duration(milliseconds: 200));
    expect(settler.ingest(1), isNull);
    now = now.add(const Duration(milliseconds: 250));
    expect(settler.ingest(1), 1);
    expect(settler.ingest(1), isNull);

    expect(settler.ingest(2), isNull);
    now = now.add(const Duration(milliseconds: 100));
    expect(settler.ingest(3), isNull);
    now = now.add(const Duration(milliseconds: 400));
    expect(settler.ingest(3), 3);
  });
}
