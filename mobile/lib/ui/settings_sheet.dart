import 'package:flutter/material.dart';

import '../app_controller.dart';

Future<void> showSettingsSheet(BuildContext context, AppController ctrl) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xF2111827),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (context) => _SettingsSheet(ctrl: ctrl),
  );
}

class _SettingsSheet extends StatelessWidget {
  const _SettingsSheet({required this.ctrl});

  final AppController ctrl;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ctrl,
      builder: (context, _) {
        final s = ctrl.settings;
        final ar = s.isRtl;
        return Directionality(
          textDirection: ar ? TextDirection.rtl : TextDirection.ltr,
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              16,
              20,
              20 + MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          ar ? 'إعدادات منظم الوقت' : 'Timer Settings',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: Text(ar ? 'إغلاق' : 'Close'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _label(ar ? 'المظهر' : 'Theme'),
                  DropdownButton<String>(
                    isExpanded: true,
                    dropdownColor: const Color(0xFF111827),
                    value: s.theme,
                    items: const [
                      DropdownMenuItem(value: 'white', child: Text('White')),
                      DropdownMenuItem(value: 'black', child: Text('Black')),
                    ],
                    onChanged: (v) {
                      if (v != null) ctrl.updateSettings(s.copyWith(theme: v));
                    },
                  ),
                  _label(ar ? 'اللغة' : 'Language'),
                  DropdownButton<String>(
                    isExpanded: true,
                    dropdownColor: const Color(0xFF111827),
                    value: s.language,
                    items: const [
                      DropdownMenuItem(value: 'ar', child: Text('العربية')),
                      DropdownMenuItem(value: 'en', child: Text('English')),
                    ],
                    onChanged: (v) {
                      if (v != null) ctrl.updateSettings(s.copyWith(language: v));
                    },
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: List.generate(6, (i) {
                      return SizedBox(
                        width: 96,
                        child: TextFormField(
                          key: ValueKey('face-$i-${s.faceMinutes[i]}'),
                          initialValue: '${s.faceMinutes[i]}',
                          keyboardType: TextInputType.number,
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(
                            labelText: '${ar ? 'الدقائق' : 'Minutes'} ${i + 1}',
                            labelStyle: const TextStyle(color: Color(0xFFD1D5DB)),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(color: Color(0x29FFFFFF)),
                            ),
                          ),
                          onFieldSubmitted: (raw) {
                            final n = int.tryParse(raw) ?? s.faceMinutes[i];
                            final next = [...s.faceMinutes];
                            next[i] = n.clamp(1, 180);
                            ctrl.updateSettings(s.copyWith(faceMinutes: next));
                          },
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      ar ? 'الصوت' : 'Sound',
                      style: const TextStyle(color: Colors.white),
                    ),
                    value: s.soundEnabled,
                    onChanged: (v) =>
                        ctrl.updateSettings(s.copyWith(soundEnabled: v)),
                  ),
                  OutlinedButton(
                    onPressed: ctrl.testAlarm,
                    child: Text(
                      ctrl.testingAlarm
                          ? (ar ? 'إيقاف التنبيه' : 'Stop alarm')
                          : (ar ? 'تجربة التنبيه' : 'Test alarm'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _label(String text) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Text(text, style: const TextStyle(color: Color(0xFFD1D5DB))),
    );
  }
}
