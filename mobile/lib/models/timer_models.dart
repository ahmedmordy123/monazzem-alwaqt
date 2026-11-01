enum CubeTimerState { idle, running, paused, finished }

class TimerSnapshot {
  const TimerSnapshot({
    required this.state,
    required this.activeFace,
    required this.duration,
    required this.remaining,
    this.endAt,
  });

  final CubeTimerState state;
  final int activeFace;
  final Duration duration;
  final Duration remaining;
  final DateTime? endAt;

  bool get isFinished => state == CubeTimerState.finished;
}

class AppSettings {
  const AppSettings({
    this.faceMinutes = const [5, 15, 25, 45, 60, 10],
    this.theme = 'white',
    this.language = 'ar',
    this.soundEnabled = true,
  });

  final List<int> faceMinutes;
  final String theme;
  final String language;
  final bool soundEnabled;

  bool get isRtl => language == 'ar';
  bool get isBlack => theme == 'black';

  Duration durationFor(int face) {
    final minutes = faceMinutes[face.clamp(0, faceMinutes.length - 1)];
    return Duration(minutes: minutes.clamp(1, 180));
  }

  AppSettings copyWith({
    List<int>? faceMinutes,
    String? theme,
    String? language,
    bool? soundEnabled,
  }) {
    return AppSettings(
      faceMinutes: faceMinutes ?? this.faceMinutes,
      theme: theme ?? this.theme,
      language: language ?? this.language,
      soundEnabled: soundEnabled ?? this.soundEnabled,
    );
  }

  Map<String, Object> toJson() => {
        'faceMinutes': faceMinutes,
        'theme': theme,
        'language': language,
        'soundEnabled': soundEnabled,
      };

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    final raw = json['faceMinutes'];
    final minutes = raw is List
        ? raw.map((e) => (e as num).toInt()).toList()
        : const [5, 15, 25, 45, 60, 10];
    while (minutes.length < 6) {
      minutes.add(10);
    }
    return AppSettings(
      faceMinutes: minutes.take(6).toList(),
      theme: json['theme'] as String? ?? 'white',
      language: json['language'] as String? ?? 'ar',
      soundEnabled: json['soundEnabled'] as bool? ?? true,
    );
  }
}

class DisplayTime {
  const DisplayTime({
    required this.left,
    required this.right,
    required this.unit,
  });

  final String left;
  final String right;
  final String unit;

  factory DisplayTime.fromRemaining(Duration remaining) {
    var total = remaining.inSeconds.clamp(0, 99 * 3600);
    if (total >= 100 * 60) {
      final hours = total ~/ 3600;
      final minutes = (total % 3600) ~/ 60;
      return DisplayTime(
        left: hours.toString().padLeft(2, '0'),
        right: minutes.toString().padLeft(2, '0'),
        unit: 'HR',
      );
    }
    final minutes = total ~/ 60;
    final seconds = total % 60;
    return DisplayTime(
      left: minutes.toString().padLeft(2, '0'),
      right: seconds.toString().padLeft(2, '0'),
      unit: 'MIN',
    );
  }
}
