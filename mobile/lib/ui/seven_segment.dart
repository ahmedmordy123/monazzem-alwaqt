import 'package:flutter/material.dart';

const _segMap = <String, Set<String>>{
  '0': {'a', 'b', 'c', 'd', 'e', 'f'},
  '1': {'b', 'c'},
  '2': {'a', 'b', 'd', 'e', 'g'},
  '3': {'a', 'b', 'c', 'd', 'g'},
  '4': {'b', 'c', 'f', 'g'},
  '5': {'a', 'c', 'd', 'f', 'g'},
  '6': {'a', 'c', 'd', 'e', 'f', 'g'},
  '7': {'a', 'b', 'c'},
  '8': {'a', 'b', 'c', 'd', 'e', 'f', 'g'},
  '9': {'a', 'b', 'c', 'd', 'f', 'g'},
};

class LedRow extends StatelessWidget {
  const LedRow({
    super.key,
    required this.left,
    required this.right,
    required this.unit,
    this.blinking = false,
    this.flashing = false,
  });

  final String left;
  final String right;
  final String unit;
  final bool blinking;
  final bool flashing;

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 220),
      opacity: flashing ? 0.2 : 1,
      child: FittedBox(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            LedDigit(char: left[0]),
            const SizedBox(width: 6),
            LedDigit(char: left[1]),
            _Colon(on: !blinking || DateTime.now().second.isEven),
            LedDigit(char: right[0]),
            const SizedBox(width: 6),
            LedDigit(char: right[1]),
          ],
        ),
      ),
    );
  }
}

class LedDigit extends StatelessWidget {
  const LedDigit({super.key, required this.char});

  final String char;

  @override
  Widget build(BuildContext context) {
    final on = _segMap[char] ?? {};
    return SizedBox(
      width: 36,
      height: 64,
      child: CustomPaint(painter: _SevenSegPainter(on)),
    );
  }
}

class _Colon extends StatelessWidget {
  const _Colon({required this.on});

  final bool on;

  @override
  Widget build(BuildContext context) {
    final color = on ? const Color(0xFFF0F0F0) : const Color(0xFF2A2A2A);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _dot(color),
          const SizedBox(height: 14),
          _dot(color),
        ],
      ),
    );
  }

  Widget _dot(Color color) => Container(
        width: 7,
        height: 7,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      );
}

class _SevenSegPainter extends CustomPainter {
  _SevenSegPainter(this.on);

  final Set<String> on;

  @override
  void paint(Canvas canvas, Size size) {
    final off = Paint()..color = const Color(0xFF1A1A1A).withValues(alpha: 0.35);
    final lit = Paint()..color = const Color(0xFFF0F0F0);
    void seg(String name, Rect r) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(r, const Radius.circular(2)),
        on.contains(name) ? lit : off,
      );
    }

    final w = size.width;
    final h = size.height;
    final t = h * 0.1;
    seg('a', Rect.fromLTWH(w * 0.18, 0, w * 0.64, t));
    seg('b', Rect.fromLTWH(w * 0.86, h * 0.1, w * 0.14, h * 0.36));
    seg('c', Rect.fromLTWH(w * 0.86, h * 0.54, w * 0.14, h * 0.36));
    seg('d', Rect.fromLTWH(w * 0.18, h - t, w * 0.64, t));
    seg('e', Rect.fromLTWH(0, h * 0.54, w * 0.14, h * 0.36));
    seg('f', Rect.fromLTWH(0, h * 0.1, w * 0.14, h * 0.36));
    seg('g', Rect.fromLTWH(w * 0.18, h * 0.45, w * 0.64, t));
  }

  @override
  bool shouldRepaint(covariant _SevenSegPainter oldDelegate) =>
      oldDelegate.on != on;
}
