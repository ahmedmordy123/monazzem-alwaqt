import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../models/timer_models.dart';
import 'cube.dart';
import 'settings_sheet.dart';

class DeskPage extends StatelessWidget {
  const DeskPage({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final s = controller.settings;
        final t = controller.timer;
        final finished = t.state == CubeTimerState.finished;
        final shortest = MediaQuery.sizeOf(context).shortestSide;
        final size = (shortest * 0.62).clamp(200.0, 340.0);
        final hint = finished
            ? (s.isRtl ? 'اضغط لإيقاف التنبيه' : 'Tap to stop the alarm')
            : (s.isRtl
                ? 'حط الموبايل على وجه المدة · اسحب أو اضغط'
                : 'Lay the phone on a duration face · swipe or tap');

        return Scaffold(
          backgroundColor: const Color(0xFF0A0A0A),
          body: SafeArea(
            child: Stack(
              children: [
                Center(
                  child: FlipCube(
                    snapshot: t,
                    settings: s,
                    size: size,
                    onTap: controller.tap,
                    onLongPress: controller.reset,
                    onSwipe: controller.swipeFlip,
                  ),
                ),
                Positioned(
                  top: 12,
                  right: 12,
                  child: TextButton(
                    onPressed: () => showSettingsSheet(context, controller),
                    child: Text(
                      s.isRtl ? 'إعدادات' : 'Settings',
                      style: const TextStyle(color: Color(0xFFD1D5DB)),
                    ),
                  ),
                ),
                Positioned(
                  left: 24,
                  right: 24,
                  bottom: 28,
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 400),
                    opacity: controller.hintVisible || finished ? 1 : 0,
                    child: Text(
                      hint,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: finished
                            ? const Color(0xFFE8E8E8)
                            : const Color(0xFF6B7280),
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
