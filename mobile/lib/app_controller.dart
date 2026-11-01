import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'engine/face_detector.dart';
import 'engine/timer_engine.dart';
import 'models/timer_models.dart';
import 'services/alarm_player.dart';
import 'services/settings_store.dart';

class AppController extends ChangeNotifier {
  AppController({
    SettingsStore? store,
    AlarmPlayer? alarm,
    TimerEngine? engine,
  })  : _store = store ?? SettingsStore(),
        _alarm = alarm ?? AlarmPlayer(),
        engine = engine ?? TimerEngine();

  final SettingsStore _store;
  final AlarmPlayer _alarm;
  final TimerEngine engine;
  final FaceSettler _settler = FaceSettler();

  AppSettings settings = const AppSettings();
  bool alarmActive = false;
  bool hintVisible = true;
  bool _primed = false;
  StreamSubscription<AccelerometerEvent>? _accelSub;
  Timer? _tick;
  Timer? _hintTimer;

  TimerSnapshot get timer => engine.snapshot;

  Future<void> init() async {
    settings = await _store.load();
    engine.setFaceMinutes(settings.faceMinutes);
    _accelSub = accelerometerEventStream(
      samplingPeriod: SensorInterval.uiInterval,
    ).listen(_onAccel);
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) => _onTick());
    _hintTimer = Timer(const Duration(seconds: 4), () {
      hintVisible = false;
      notifyListeners();
    });
    notifyListeners();
  }

  void _onAccel(AccelerometerEvent e) {
    final face = faceFromAccel(e.x, e.y, e.z);
    final settled = _settler.ingest(face);
    if (settled == null) return;
    if (!_primed) {
      _primed = true;
      engine.setIdleFace(settled);
      notifyListeners();
      return;
    }
    if (settled == engine.activeFace) return;
    dismissAlarm();
    engine.flipSettle(settled);
    _syncWake();
    notifyListeners();
  }

  void _onTick() {
    final finished = engine.tick();
    if (finished) {
      _onFinished();
    }
    if (engine.state == CubeTimerState.running || finished) {
      notifyListeners();
    }
  }

  Future<void> _onFinished() async {
    alarmActive = true;
    _syncWake();
    await _alarm.play(enabled: settings.soundEnabled);
    notifyListeners();
  }

  void tap() {
    if (engine.state == CubeTimerState.finished || alarmActive) {
      dismissAlarm();
      engine.reset();
      _syncWake();
      notifyListeners();
      return;
    }
    engine.tap();
    _syncWake();
    notifyListeners();
  }

  void reset() {
    dismissAlarm();
    engine.reset();
    _syncWake();
    notifyListeners();
  }

  void swipeFlip(int direction) {
    final next = (engine.activeFace + direction) % 6;
    final face = next < 0 ? next + 6 : next;
    dismissAlarm();
    engine.flipSettle(face);
    _settler.current = face;
    _syncWake();
    notifyListeners();
  }

  Future<void> updateSettings(AppSettings next) async {
    settings = next;
    engine.setFaceMinutes(next.faceMinutes);
    await _store.save(next);
    notifyListeners();
  }

  void dismissAlarm() {
    if (!alarmActive && !_alarm.isPlaying) return;
    alarmActive = false;
    unawaited(_alarm.stop());
  }

  Future<void> testAlarm() async {
    if (_alarm.isPlaying) {
      await _alarm.stop();
      notifyListeners();
      return;
    }
    await _alarm.play(enabled: true);
    notifyListeners();
  }

  bool get testingAlarm =>
      _alarm.isPlaying && engine.state != CubeTimerState.finished;

  void _syncWake() {
    final keep = engine.state == CubeTimerState.running ||
        engine.state == CubeTimerState.finished;
    if (keep) {
      unawaited(WakelockPlus.enable());
    } else {
      unawaited(WakelockPlus.disable());
    }
  }

  @override
  void dispose() {
    _accelSub?.cancel();
    _tick?.cancel();
    _hintTimer?.cancel();
    unawaited(WakelockPlus.disable());
    unawaited(_alarm.dispose());
    super.dispose();
  }
}
