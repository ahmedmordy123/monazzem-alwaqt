import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_controller.dart';
import 'ui/desk_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Follow gravity so after any flip the UI (and time) faces the user upright.
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  final controller = AppController();
  await controller.init();
  runApp(MonazzemApp(controller: controller));
}

class MonazzemApp extends StatelessWidget {
  const MonazzemApp({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        return MaterialApp(
          title: 'منظم الوقت',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            brightness: Brightness.dark,
            colorSchemeSeed: const Color(0xFF3AA0FF),
          ),
          home: DeskPage(controller: controller),
        );
      },
    );
  }
}
