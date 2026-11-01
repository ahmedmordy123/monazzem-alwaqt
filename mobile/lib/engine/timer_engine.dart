import '../models/timer_models.dart';

/// Deadline-based timer. Remaining is always computed from [clock], so
/// lock-screen gaps and scheduler jitter do not accumulate.
class TimerEngine {
  TimerEngine({
    DateTime Function()? clock,
    List<int> faceMinutes = const [5, 15, 25, 45, 60, 10],
  })  : clock = clock ?? DateTime.now,
        _faceMinutes = List<int>.from(faceMinutes) {
    _duration = _durationFor(_activeFace);
    _remaining = _duration;
  }

  DateTime Function() clock;
  List<int> _faceMinutes;
  CubeTimerState _state = CubeTimerState.idle;
  int _activeFace = 0;
  Duration _duration = const Duration(minutes: 5);
  Duration _remaining = const Duration(minutes: 5);
  DateTime? _endAt;

  CubeTimerState get state => _state;
  int get activeFace => _activeFace;
  Duration get duration => _duration;
  Duration get remaining => _remaining;
  DateTime? get endAt => _endAt;

  TimerSnapshot get snapshot => TimerSnapshot(
        state: _state,
        activeFace: _activeFace,
        duration: _duration,
        remaining: _remaining,
        endAt: _endAt,
      );

  void setFaceMinutes(List<int> minutes) {
    _faceMinutes = List<int>.from(minutes);
    if (_state == CubeTimerState.idle) {
      _duration = _durationFor(_activeFace);
      _remaining = _duration;
    }
  }

  Duration _durationFor(int face) {
    final minutes = _faceMinutes[face.clamp(0, _faceMinutes.length - 1)];
    return Duration(minutes: minutes.clamp(1, 180));
  }

  Duration _clampRemaining(Duration value) {
    if (value.isNegative) return Duration.zero;
    if (value > _duration) return _duration;
    return value;
  }

  void setIdleFace(int face) {
    _activeFace = face.clamp(0, 5);
    if (_state == CubeTimerState.idle) {
      _duration = _durationFor(_activeFace);
      _remaining = _duration;
    }
  }

  /// Flip settled on [face]: assign that duration and start running.
  void flipSettle(int face) {
    _activeFace = face.clamp(0, 5);
    _duration = _durationFor(_activeFace);
    _remaining = _duration;
    _endAt = clock().add(_duration);
    _state = CubeTimerState.running;
  }

  void tap() {
    switch (_state) {
      case CubeTimerState.running:
        _remaining = _remainingFromDeadline();
        _endAt = null;
        _state = CubeTimerState.paused;
      case CubeTimerState.paused:
        if (_remaining == Duration.zero) {
          _state = CubeTimerState.finished;
          _endAt = null;
        } else {
          _endAt = clock().add(_remaining);
          _state = CubeTimerState.running;
        }
      case CubeTimerState.idle:
        _duration = _durationFor(_activeFace);
        _remaining = _duration;
        _endAt = clock().add(_duration);
        _state = CubeTimerState.running;
      case CubeTimerState.finished:
        reset();
    }
  }

  void reset() {
    _state = CubeTimerState.idle;
    _duration = _durationFor(_activeFace);
    _remaining = _duration;
    _endAt = null;
  }

  /// Returns true if the timer just reached Finished.
  bool tick() {
    if (_state != CubeTimerState.running || _endAt == null) return false;
    final next = _clampRemaining(_endAt!.difference(clock()));
    if (next == Duration.zero) {
      _remaining = Duration.zero;
      _endAt = null;
      _state = CubeTimerState.finished;
      return true;
    }
    _remaining = next;
    return false;
  }

  Duration _remainingFromDeadline() {
    if (_endAt == null) return _remaining;
    return _clampRemaining(_endAt!.difference(clock()));
  }
}
