import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { snapMenu } from '@/lib/menu';

// "Snap the menu": photograph a menu and AI adds every dish on it to the restaurant.
export function SnapMenuButton({ restaurantId, onAdded }: { restaurantId: string; onAdded: () => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  async function run(fromCamera: boolean) {
    setBusy(true); setNote(null);
    try {
      const result = await snapMenu(restaurantId, fromCamera);
      if (!result) return;
      if (result.added) onAdded();
      setNote({
        text: result.added
          ? `Added ${result.added} dish${result.added === 1 ? '' : 'es'} to the menu.`
          : result.found ? 'Every dish in that photo is already on the menu.' : "Couldn't find any dishes in that photo. Try a clearer, closer photo.",
      });
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  function choose() {
    Alert.alert('Snap the menu', 'Photograph the menu and every dish on it is added for everyone.', [
      { text: 'Take photo', onPress: () => run(true) },
      { text: 'Choose from photos', onPress: () => run(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={{ gap: 6 }}>
      <Button variant="ghost" title={busy ? 'Reading the menu…' : 'Snap the menu'} onPress={choose} busy={busy} />
      {note ? <Text style={{ color: note.error ? t.lo : t.muted, fontSize: 13, textAlign: 'center' }}>{note.text}</Text> : null}
    </View>
  );
}
