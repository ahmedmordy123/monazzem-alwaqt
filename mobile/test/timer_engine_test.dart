import 'package:flutter_test/flutter_test.dart';
import 'package:monazzem/engine/timer_engine.dart';
import 'package:monazzem/models/timer_models.dart';

void main() {
  test('flipSettle starts a deadline timer', () {
    var now = DateTime.utc(2026, 1, 1);
    final engine = TimerEngine(clock: () => now);
    engine.flipSettle(1);
    expect(engine.state, CubeTimerState.running);
    expect(engine.activeFace, 1);
    expect(engine.remaining, const Duration(minutes: 15));

    now = now.add(const Duration(minutes: 3));
    expect(engine.tick(), isFalse);
    expect(engine.remaining, const Duration(minutes: 12));
  });

  test('tick finishes at deadline and tap resets', () {
    var now = DateTime.utc(2026, 1, 1);
    final engine = TimerEngine(clock: () => now);
    engine.flipSettle(0);
    now = now.add(const Duration(minutes: 5));
    expect(engine.tick(), isTrue);
    expect(engine.state, CubeTimerState.finished);
    expect(engine.remaining, Duration.zero);

    engine.tap();
    expect(engine.state, CubeTimerState.idle);
    expect(engine.remaining, const Duration(minutes: 5));
  });

  test('tap pauses and resumes without losing remaining', () {
    var now = DateTime.utc(2026, 1, 1);
    final engine = TimerEngine(clock: () => now);
    engine.flipSettle(0);
    now = now.add(const Duration(minutes: 1));
    engine.tick();
    engine.tap();
    expect(engine.state, CubeTimerState.paused);
    expect(engine.remaining, const Duration(minutes: 4));

    now = now.add(const Duration(minutes: 10));
    expect(engine.tick(), isFalse);
    engine.tap();
    expect(engine.state, CubeTimerState.running);
    now = now.add(const Duration(minutes: 4));
    expect(engine.tick(), isTrue);
    expect(engine.state, CubeTimerState.finished);
  });
}
