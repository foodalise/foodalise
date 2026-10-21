import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoSymbol, Wordmark } from '@/components/Logo';
import { Button, Field } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const USERNAME = /^[a-z0-9_.]{3,30}$/;

export default function SignIn() {
  const t = useTheme();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setMessage(null);
    if (mode === 'up' && !USERNAME.test(username)) {
      setMessage('Usernames are 3–30 characters: lowercase letters, numbers, dots and underscores.');
      return;
    }
    setBusy(true);
    if (mode === 'up') {
      const { data: taken } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
      if (taken) {
        setBusy(false);
        setMessage(`@${username} is already taken. Try another username.`);
        return;
      }
    }
    const { error, data } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username } } });
    setBusy(false);
    // Two people picking the same name at the same moment: the database refuses the second.
    if (error) setMessage(/database error saving new user/i.test(error.message) ? `@${username} is already taken. Try another username.` : error.message);
    else if (mode === 'up' && !data.session) setMessage('Check your email to confirm your account, then sign in.');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'flex-start', gap: 14 }}>
            <LogoSymbol height={64} />
            <Wordmark size={40} />
          </View>
          <Text style={[styles.tagline, { color: t.muted }]}>Every dish you've tried, photographed and scored.</Text>
          <View style={styles.form}>
            {mode === 'up' ? (
              <Field placeholder="Username" autoCapitalize="none" autoCorrect={false} value={username}
                onChangeText={(v) => setUsername(v.toLowerCase())} />
            ) : null}
            <Field placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email"
              value={email} onChangeText={setEmail} />
            <Field placeholder="Password" secureTextEntry autoComplete={mode === 'in' ? 'password' : 'new-password'}
              value={password} onChangeText={setPassword} />
            {message ? <Text style={{ color: t.lo }}>{message}</Text> : null}
            <Button title={mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} busy={busy}
              disabled={!email || password.length < 6} />
            <Button variant="ghost" title={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
              onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage(null); }} />
            <Text style={{ color: t.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
              {mode === 'up' ? 'By creating an account you agree to our ' : 'Read our '}
              <Text style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/terms')}>Terms of Use</Text>
              {' and '}
              <Text style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/privacy')}>Privacy policy</Text>.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 8 },
  tagline: { fontSize: 15, marginBottom: 24 },
  form: { gap: 12 },
});
