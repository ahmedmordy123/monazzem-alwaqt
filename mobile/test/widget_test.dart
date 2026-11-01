import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:monazzem/app_controller.dart';
import 'package:monazzem/ui/desk_page.dart';

void main() {
  testWidgets('desk shows cube and settings', (tester) async {
    final controller = AppController();
    await tester.pumpWidget(
      MaterialApp(home: DeskPage(controller: controller)),
    );
    expect(find.textContaining('حط الموبايل'), findsOneWidget);
    expect(find.text('إعدادات'), findsOneWidget);
  });
}
