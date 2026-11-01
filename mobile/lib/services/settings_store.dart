import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/timer_models.dart';

class SettingsStore {
  static const _key = 'monazzem.settings';

  Future<AppSettings> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return const AppSettings();
    try {
      final map = jsonDecode(raw);
      if (map is Map<String, dynamic>) return AppSettings.fromJson(map);
    } catch (_) {}
    return const AppSettings();
  }

  Future<void> save(AppSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(settings.toJson()));
  }
}
