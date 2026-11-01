import 'dart:math' as math;
import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';

import '../models/timer_models.dart';

enum _CubeSide { front, back, right, left, top, bottom }

class _FacePaint {
  const _FacePaint({
    required this.depth,
    required this.facing,
    required this.widget,
  });

  final double depth;
  final double facing;
  final Widget widget;
}

class _Vec3 {
  const _Vec3(this.x, this.y, this.z);

  final double x;
  final double y;
  final double z;
}

/// Solid Windows-style cube. Face change plays a readable ~70° flip, then
/// snaps back with updated upright numbers (same trick as the desktop app).
class FlipCube extends StatefulWidget {
  const FlipCube({
    super.key,
    required this.snapshot,
    required this.settings,
    required this.size,
    this.onTap,
    this.onLongPress,
    this.onSwipe,
  });

  final TimerSnapshot snapshot;
  final AppSettings settings;
  final double size;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final ValueChanged<int>? onSwipe;

  @override
  State<FlipCube> createState() => _FlipCubeState();
}

class _FlipCubeState extends State<FlipCube> with TickerProviderStateMixin {
  static const _n = 6;
  static const _restYaw = -22.0 * math.pi / 180;
  static const _restPitch = -19.0 * math.pi / 180;
  /// Stay well under 90° so the LED front never goes edge-on / mirrored.
  static const _flipAmt = 52.0 * math.pi / 180;

  late final AnimationController _flip;
  late final AnimationController _blink;
  late final Animation<double> _ease;

  int _paintFace = 0;
  int _lastActive = 0;
  double _dYaw = 0;
  double _dPitch = 0;
  double _dragDx = 0;

  @override
  void initState() {
    super.initState();
    _paintFace = widget.snapshot.activeFace;
    _lastActive = _paintFace;
    _flip = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 480),
    );
    _ease = CurvedAnimation(
      parent: _flip,
      curve: const Cubic(0.22, 1.05, 0.28, 1),
    );
    _blink = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 550),
    )..repeat(reverse: true);
    _flip.addStatusListener((status) {
      if (status != AnimationStatus.completed) return;
      setState(() {
        _paintFace = widget.snapshot.activeFace;
        _dYaw = 0;
        _dPitch = 0;
      });
      _flip.reset();
    });
  }

  @override
  void didUpdateWidget(covariant FlipCube oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = widget.snapshot.activeFace;
    if (next == _lastActive) return;
    final prev = _lastActive;
    _lastActive = next;
    _beginFlip(from: prev, to: next);
  }

  void _beginFlip({required int from, required int to}) {
    var step = (to - from) % _n;
    if (step < 0) step += _n;
    if (step > 3) step -= _n;

    if (step == 1 || step == -1) {
      _dYaw = step * (-_flipAmt);
      _dPitch = 0;
    } else if (step == 2 || step == -2) {
      _dYaw = 0;
      _dPitch = step.sign * (-_flipAmt);
    } else {
      _dYaw = -_flipAmt * 1.2;
      _dPitch = 0;
    }

    _paintFace = from;
    if (_flip.isAnimating) _flip.stop();
    _flip.forward(from: 0);
  }

  @override
  void dispose() {
    _flip.dispose();
    _blink.dispose();
    super.dispose();
  }

  int _mins(int offset) {
    final i = (_paintFace + offset) % _n;
    return widget.settings.faceMinutes[i < 0 ? i + _n : i];
  }

  String _pad(int m) => m.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final body = widget.settings.isBlack
        ? const Color(0xFF1C1C1C)
        : const Color(0xFFEFEFEF);
    final ink = widget.settings.isBlack
        ? const Color(0xFFC8C8C8)
        : const Color(0xFF3F3F3F);
    final display = DisplayTime.fromRemaining(widget.snapshot.remaining);
    final running = widget.snapshot.state == CubeTimerState.running;
    final finished = widget.snapshot.state == CubeTimerState.finished;
    final edge = widget.size;
    final z = edge / 2;
    final faceEdge = edge * 1.035;

    return GestureDetector(
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      onHorizontalDragStart: (_) => _dragDx = 0,
      onHorizontalDragUpdate: (d) => _dragDx += d.primaryDelta ?? 0,
      onHorizontalDragEnd: (d) {
        if (_flip.isAnimating) return;
        final v = d.primaryVelocity ?? 0;
        final dx = _dragDx;
        _dragDx = 0;
        if (v.abs() < 200 && dx.abs() < edge * 0.18) return;
        final direction = v.abs() >= 200 ? v : -dx;
        widget.onSwipe?.call(direction < 0 ? 1 : -1);
      },
      child: AnimatedBuilder(
        animation: Listenable.merge([_ease, _blink]),
        builder: (context, _) {
          final t = _ease.value;
          final yaw = _restYaw + _dYaw * t;
          final pitch = _restPitch + _dPitch * t;
          final lift = math.sin(t * math.pi) * edge * 0.035;
          final cubeRotation = Matrix4.identity()
            ..rotateX(pitch)
            ..rotateY(yaw);
          final faces = <_FacePaint>[
            _buildFacePaint(
              side: _CubeSide.back,
              cubeRotation: cubeRotation,
              edge: edge,
              faceEdge: faceEdge,
              color: Color.lerp(body, Colors.black, 0.22)!,
              transform: _faceMatrix(rotY: math.pi, z: z),
              child: _minutesLabel(_pad(_mins(3)), ink, edge),
            ),
            _buildFacePaint(
              side: _CubeSide.left,
              cubeRotation: cubeRotation,
              edge: edge,
              faceEdge: faceEdge,
              color: Color.lerp(body, Colors.black, 0.12)!,
              transform: _faceMatrix(rotY: -math.pi / 2, z: z),
              child: _minutesLabel(_pad(_mins(5)), ink, edge, scale: 0.92),
            ),
            _buildFacePaint(
              side: _CubeSide.bottom,
              cubeRotation: cubeRotation,
              edge: edge,
              faceEdge: faceEdge,
              color: Color.lerp(body, Colors.black, 0.28)!,
              transform: _faceMatrix(rotX: -math.pi / 2, z: z),
              child: _minutesLabel(_pad(_mins(2)), ink, edge),
            ),
            _buildFacePaint(
              side: _CubeSide.top,
              cubeRotation: cubeRotation,
              edge: edge,
              faceEdge: faceEdge,
              color: Color.lerp(body, Colors.white, 0.08)!,
              transform: _faceMatrix(rotX: math.pi / 2, z: z),
              child: _minutesLabel(_pad(_mins(0)), ink, edge),
            ),
            _buildFacePaint(
              side: _CubeSide.right,
              cubeRotation: cubeRotation,
              edge: edge,
              faceEdge: faceEdge,
              color: Color.lerp(body, Colors.black, 0.14)!,
              transform: _faceMatrix(rotY: math.pi / 2, z: z),
              child: _minutesLabel(_pad(_mins(1)), ink, edge, scale: 0.92),
            ),
            _buildFacePaint(
              side: _CubeSide.front,
              cubeRotation: cubeRotation,
              edge: edge,
              faceEdge: faceEdge,
              color: body,
              transform: _faceMatrix(z: z),
              child: _frontContent(
                edge: edge,
                display: display,
                running: running,
                finished: finished,
                flash: finished ? _blink.value : 1,
              ),
            ),
          ]..sort((a, b) => a.depth.compareTo(b.depth));
          // Stronger facing cut hides near-edge faces (mirrored glyphs).
          final minFacing = t > 0.08 && t < 0.92 ? 0.18 : 0.06;
          final visibleFaces = faces
              .where((face) => face.facing > minFacing)
              .map((face) => face.widget)
              .toList(growable: false);

          return SizedBox(
            width: edge * 1.55,
            height: edge * 1.55,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Positioned(
                  bottom: edge * 0.12 - lift * 0.3,
                  child: IgnorePointer(
                    child: Container(
                      width: edge * (1.05 - 0.06 * math.sin(t * math.pi)),
                      height: edge * 0.18,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(edge),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.55),
                            blurRadius: 28,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Transform.translate(
                  offset: Offset(0, -lift),
                  child: Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()
                      ..setEntry(3, 2, 0.00115)
                      ..rotateX(pitch)
                      ..rotateY(yaw),
                    child: SizedBox(
                      width: edge,
                      height: edge,
                      child: Stack(children: visibleFaces),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  _FacePaint _buildFacePaint({
    required _CubeSide side,
    required Matrix4 cubeRotation,
    required double edge,
    required double faceEdge,
    required Color color,
    required Matrix4 transform,
    required Widget child,
  }) {
    final localRotation = _sideRotation(side);
    final localNormal = _transformDirection(
      localRotation,
      const _Vec3(0, 0, 1),
    );
    final normal = _transformDirection(cubeRotation, localNormal);
    return _FacePaint(
      depth: normal.z * edge / 2,
      facing: normal.z,
      widget: _face(
        edge: faceEdge,
        color: color,
        transform: transform,
        child: child,
      ),
    );
  }

  Matrix4 _sideRotation(_CubeSide side) {
    final m = Matrix4.identity();
    switch (side) {
      case _CubeSide.front:
        break;
      case _CubeSide.back:
        m.rotateY(math.pi);
      case _CubeSide.right:
        m.rotateY(math.pi / 2);
      case _CubeSide.left:
        m.rotateY(-math.pi / 2);
      case _CubeSide.top:
        m.rotateX(math.pi / 2);
      case _CubeSide.bottom:
        m.rotateX(-math.pi / 2);
    }
    return m;
  }

  _Vec3 _transformDirection(Matrix4 matrix, _Vec3 v) {
    final s = matrix.storage;
    return _Vec3(
      s[0] * v.x + s[4] * v.y + s[8] * v.z,
      s[1] * v.x + s[5] * v.y + s[9] * v.z,
      s[2] * v.x + s[6] * v.y + s[10] * v.z,
    );
  }

  Matrix4 _faceMatrix({double rotX = 0, double rotY = 0, required double z}) {
    final m = Matrix4.identity();
    if (rotY != 0) m.rotateY(rotY);
    if (rotX != 0) m.rotateX(rotX);
    // Flutter 3.16+: prefer translateByDouble so Z offset is applied.
    m.translateByDouble(0, 0, z, 1);
    return m;
  }

  Widget _face({
    required double edge,
    required Color color,
    required Matrix4 transform,
    Widget? child,
  }) {
    return Transform(
      alignment: Alignment.center,
      transform: transform,
      child: Container(
        width: edge,
        height: edge,
        decoration: BoxDecoration(
          color: color,
          border: Border.all(color: const Color(0x22000000), width: 0.8),
        ),
        child: child,
      ),
    );
  }

  Widget _minutesLabel(
    String value,
    Color ink,
    double edge, {
    double scale = 1,
    bool flip = false,
  }) {
    return Center(
      child: Transform.rotate(
        angle: flip ? math.pi : 0,
        child: Transform.scale(
          scale: scale,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                value,
                textDirection: TextDirection.ltr,
                style: TextStyle(
                  color: ink,
                  fontSize: edge * 0.38,
                  fontWeight: FontWeight.w600,
                  height: 1,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              SizedBox(height: edge * 0.02),
              Text(
                'MIN',
                textDirection: TextDirection.ltr,
                style: TextStyle(
                  color: ink.withValues(alpha: 0.5),
                  fontSize: edge * 0.075,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 2.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _frontContent({
    required double edge,
    required DisplayTime display,
    required bool running,
    required bool finished,
    required double flash,
  }) {
    final ledColor = finished
        ? const Color(0xFFFF5A3C)
        : running
        ? const Color(0xFF3AA0FF)
        : const Color(0xFF1A2A3A);
    final ledA = finished ? (0.25 + 0.75 * flash) : 1.0;

    return Stack(
      children: [
        Positioned(
          left: edge * 0.09,
          right: edge * 0.09,
          top: edge * 0.14,
          bottom: edge * 0.14,
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF050505),
              borderRadius: BorderRadius.circular(edge * 0.05),
            ),
          ),
        ),
        Positioned(
          left: edge * 0.16,
          top: edge * 0.22,
          child: Container(
            width: edge * 0.055,
            height: edge * 0.055,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: ledColor.withValues(alpha: ledA),
              boxShadow: (running || finished)
                  ? [
                      BoxShadow(
                        color: ledColor.withValues(alpha: 0.7 * ledA),
                        blurRadius: edge * 0.04,
                      ),
                    ]
                  : null,
            ),
          ),
        ),
        Center(
          child: Text(
            '${display.left}:${display.right}',
            textDirection: TextDirection.ltr,
            style: TextStyle(
              color: Color.fromRGBO(240, 240, 240, finished ? ledA : 1),
              fontSize: edge * 0.2,
              fontWeight: FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
        Positioned(
          right: edge * 0.16,
          bottom: edge * 0.2,
          child: Text(
            display.unit,
            textDirection: TextDirection.ltr,
            style: TextStyle(
              color: const Color(0xB3F0F0F0),
              fontSize: edge * 0.045,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
        ),
      ],
    );
  }
}
