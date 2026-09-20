import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

const _apiUrl = String.fromEnvironment(
  'BINZ_API_URL',
  defaultValue: 'https://binz-clone.onrender.com',
);
const _tokenKey = 'binz_session_token';

class Account {
  final String firstName;
  final String lastName;
  final String email;
  final String state;
  final int coins;
  final bool admin;

  const Account(
      {required this.firstName,
      required this.lastName,
      required this.email,
      required this.state,
      required this.coins,
      required this.admin});

  factory Account.fromJson(Map<String, dynamic> json) => Account(
        firstName: json['firstName'] as String? ?? '',
        lastName: json['lastName'] as String? ?? '',
        email: json['email'] as String? ?? '',
        state: json['state'] as String? ?? '',
        coins: (json['coins'] as num? ?? 0).round(),
        admin: json['admin'] == true,
      );
}

class AccountSession extends ChangeNotifier {
  final _storage = const FlutterSecureStorage();
  bool ready = false;
  Account? account;
  String? _token;

  bool get signedIn => account != null;
  bool get isAdmin => account?.admin == true;
  String get apiUrl => _apiUrl.replaceAll(RegExp(r'/+$'), '');
  bool get configured => apiUrl.isNotEmpty;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'flutter',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<void> restore() async {
    _token = await _storage.read(key: _tokenKey);
    if (_token != null && configured) {
      try {
        final response =
            await http.get(Uri.parse('$apiUrl/session'), headers: _headers);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          account = Account.fromJson(
              jsonDecode(response.body) as Map<String, dynamic>);
        }
      } catch (_) {
        // Start signed out if the API is unavailable; the sign-in screen explains configuration.
      }
    }
    ready = true;
    notifyListeners();
  }

  Future<void> signIn(String email, String password) =>
      _authenticate('/login', {
        'email': email.trim().toLowerCase(),
        'password': password,
      });

  Future<void> register(
          {required String firstName,
          required String lastName,
          required String email,
          required String password,
          required String state}) =>
      _authenticate('/register', {
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'email': email.trim().toLowerCase(),
        'password': password,
        'state': state.trim(),
      });

  Future<void> _authenticate(String path, Map<String, String> body) async {
    if (!configured) {
      throw StateError('The app is not configured with the Render API URL.');
    }
    final response = await http.post(Uri.parse('$apiUrl$path'),
        headers: _headers, body: jsonEncode(body));
    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
          payload['message'] as String? ?? 'Unable to access your account.');
    }
    final token = payload['sessionToken'] as String?;
    if (token == null || token.isEmpty) {
      throw StateError('The server did not return a mobile session.');
    }
    _token = token;
    await _storage.write(key: _tokenKey, value: token);
    account =
        Account.fromJson((payload['User'] ?? payload) as Map<String, dynamic>);
    notifyListeners();
  }

  Future<void> signOut() async {
    if (configured && _token != null) {
      try {
        await http.post(Uri.parse('$apiUrl/logout'), headers: _headers);
      } catch (_) {}
    }
    _token = null;
    account = null;
    await _storage.delete(key: _tokenKey);
    notifyListeners();
  }
}
