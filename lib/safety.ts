import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export const REPORT_REASONS = ['Offensive or abusive', 'Looks fake or paid for', 'Spam or misleading', 'Inappropriate photo', 'Not about food'];

// Flags a review for the Foodalise team and hides it from you straight away.
export async function reportReview(reporterId: string, reviewId: string, reason: string) {
  const { error } = await supabase.from('reports').insert({ reporter_id: reporterId, review_id: reviewId, reason });
  // Already reported by you: nothing more to do.
  if (error && error.code !== '23505') throw new Error(`Couldn't send the report: ${error.message}`);
}

// Hides everything the person posts from you and ends any follow between you.
export async function blockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && error.code !== '23505') throw new Error(`Couldn't block them: ${error.message}`);
}

export async function unblockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  if (error) throw new Error(`Couldn't unblock them: ${error.message}`);
}

// Deletes your account, reviews and photos for good, then signs you out.
export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    const message = error instanceof FunctionsHttpError ? (await error.context.json().catch(() => null))?.error : null;
    throw new Error(message ?? "Couldn't delete your account. Check your connection and try again.");
  }
  await supabase.auth.signOut({ scope: 'local' });
}
