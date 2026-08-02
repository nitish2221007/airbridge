import 'dart:io';

import 'package:flutter/material.dart';

void main() {
  runApp(const AirbridgeApp());
}

class AirbridgeApp extends StatelessWidget {
  const AirbridgeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Airbridge',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3B6EF5)),
        useMaterial3: true,
      ),
      home: const PreflightPage(),
    );
  }
}

/// Stage 0 screen. Its only job is to prove that the CI pipeline produces a
/// working APK and a working Windows .exe, and to show the network facts we
/// will need for the real transport layer.
class PreflightPage extends StatefulWidget {
  const PreflightPage({super.key});

  @override
  State<PreflightPage> createState() => _PreflightPageState();
}

class _PreflightPageState extends State<PreflightPage> {
  List<String> _addresses = const [];
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadAddresses();
  }

  Future<void> _loadAddresses() async {
    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
      );
      final found = <String>[];
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          found.add('${iface.name}  ${addr.address}');
        }
      }
      if (!mounted) return;
      setState(() => _addresses = found);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Airbridge'),
        backgroundColor: theme.colorScheme.primaryContainer,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Build is alive', style: theme.textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text('Platform: ${Platform.operatingSystem} '
                      '(${Platform.operatingSystemVersion})'),
                  Text('Dart: ${Platform.version.split(' ').first}'),
                  Text('Host: ${Platform.localHostname}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Local IPv4 addresses', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          if (_error.isNotEmpty)
            Text(_error, style: TextStyle(color: theme.colorScheme.error))
          else if (_addresses.isEmpty)
            const Text('No non-loopback IPv4 interface found.')
          else
            ..._addresses.map(
              (a) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text(a, style: const TextStyle(fontFamily: 'monospace')),
              ),
            ),
          const SizedBox(height: 24),
          Text(
            'Stage 0 skeleton. Once this runs on both phone and PC, the real '
            'transport, transfer and history code lands on top of it.',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _loadAddresses,
        tooltip: 'Refresh',
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
