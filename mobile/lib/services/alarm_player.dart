import 'package:audioplayers/audioplayers.dart';

class AlarmPlayer {
  final AudioPlayer _player = AudioPlayer();
  bool _looping = false;

  Future<void> play({required bool enabled}) async {
    if (!enabled) return;
    await stop();
    _looping = true;
    await _player.setReleaseMode(ReleaseMode.loop);
    await _player.setVolume(0.9);
    try {
      await _player.play(AssetSource('sounds/alarm.wav'));
    } catch (_) {
      _looping = false;
    }
  }

  Future<void> stop() async {
    _looping = false;
    await _player.stop();
  }

  bool get isPlaying => _looping;

  Future<void> dispose() => _player.dispose();
}
