import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoSymbol, Wordmark } from '@/components/Logo';
import { Button, Field } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const USERNAME = /^[a-z0-9_.]{3,30}$/;

export default function SignIn() {
  const t = useTheme();
  const { setRecovering } = useAuth();
  // in/up: sign in or create an account. forgot → code → reset: a 6-digit code is
  // emailed, which signs them in, then they choose a new password.
  const [mode, setMode] = useState<'in' | 'up' | 'forgot' | 'code' | 'reset'>('in');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode() {
    setMessage(null);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) setMessage(/rate limit/i.test(error.message) ? 'Too many emails sent. Wait a few minutes and try again.' : error.message);
    else { setMode('code'); setMessage(null); }
  }

  async function checkCode() {
    setMessage(null);
    setBusy(true);
    setRecovering(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    setBusy(false);
    if (error) {
      setRecovering(false);
      setMessage('That code didn’t work. Check it, or send a new one.');
    } else { setMode('reset'); setPassword(''); }
  }

  async function savePassword() {
    setMessage(null);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage(/different from the old/i.test(error.message) ? 'Pick a password you haven’t used before.' : error.message);
    else setRecovering(false); // straight into the app
  }

  async function cancelReset() {
    if (mode === 'reset') await supabase.auth.signOut();
    setRecovering(false);
    setMode('in');
    setMessage(null);
    setCode('');
  }

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
      const { data: rude } = await supabase.rpc('has_blocked_words', { t: username });
      if (rude) {
        setBusy(false);
        setMessage('Please pick a different username.');
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
          {mode === 'forgot' || mode === 'code' || mode === 'reset' ? (
            <View style={styles.form}>
              <Text style={[styles.heading, { color: t.ink }]}>
                {mode === 'forgot' ? 'Forgot your password?' : mode === 'code' ? 'Check your email' : 'Choose a new password'}
              </Text>
              <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
                {mode === 'forgot' ? 'Enter your email and we’ll send you a code to reset it.'
                  : mode === 'code' ? `We sent a code to ${email.trim()}. Type it in below.`
                  : 'At least 6 characters.'}
              </Text>
              {mode === 'forgot' ? (
                <Field placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email"
                  value={email} onChangeText={setEmail} />
              ) : mode === 'code' ? (
                <Field placeholder="Code" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
                  maxLength={10} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} />
              ) : (
                <Field placeholder="New password" secureTextEntry autoComplete="new-password"
                  value={password} onChangeText={setPassword} />
              )}
              {message ? <Text style={{ color: t.lo }}>{message}</Text> : null}
              {mode === 'forgot' ? (
                <Button title="Send code" onPress={sendCode} busy={busy} disabled={!email.includes('@')} />
              ) : mode === 'code' ? (
                <>
                  <Button title="Continue" onPress={checkCode} busy={busy} disabled={code.length < 6} />
                  <Button variant="ghost" title="Send a new code" onPress={sendCode} disabled={busy} />
                </>
              ) : (
                <Button title="Save and sign in" onPress={savePassword} busy={busy} disabled={password.length < 6} />
              )}
              <Button variant="ghost" title="Back to sign in" onPress={cancelReset} disabled={busy} />
            </View>
          ) : (
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
              {mode === 'in' ? (
                <Pressable onPress={() => { setMode('forgot'); setMessage(null); }} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
                  <Text style={{ color: t.accent, fontWeight: '600' }}>Forgot password?</Text>
                </Pressable>
              ) : null}
              <Button variant="ghost" title={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
                onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage(null); }} />
              <Text style={{ color: t.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
                {mode === 'up' ? 'By creating an account you confirm you are 18 or over and agree to our ' : 'Read our '}
                <Text style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/terms')}>Terms of Use</Text>
                {' and '}
                <Text style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/privacy')}>Privacy policy</Text>.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 8 },
  tagline: { fontSize: 15, marginBottom: 24 },
  form: { gap: 12 },
  heading: { fontSize: 22, fontWeight: '800' },
});
