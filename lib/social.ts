import { supabase } from './supabase';

export type Comment = { id: string; body: string; created_at: string; user_id: string; profiles: { username: string } | null };

export async function setLiked(userId: string, reviewId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('review_likes').insert({ review_id: reviewId, user_id: userId })
    : await supabase.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', userId);
  // Already liked (a double tap): nothing more to do.
  if (error && error.code !== '23505') throw new Error("Couldn't save that. Check your connection and try again.");
}

export async function loadComments(reviewId: string) {
  const { data } = await supabase.from('review_comments').select('id, body, created_at, user_id, profiles!review_comments_user_id_fkey(username)')
    .eq('review_id', reviewId).order('created_at').returns<Comment[]>();
  return data ?? [];
}

export async function addComment(userId: string, reviewId: string, body: string) {
  const { error } = await supabase.from('review_comments').insert({ review_id: reviewId, user_id: userId, body: body.trim() });
  if (error) throw new Error("Couldn't post your comment. Check your connection and try again.");
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from('review_comments').delete().eq('id', commentId);
  if (error) throw new Error("Couldn't delete the comment.");
}

// Flags a comment for the Foodalise team and hides it from you straight away.
export async function reportComment(reporterId: string, commentId: string, reason: string) {
  const { error } = await supabase.from('reports').insert({ reporter_id: reporterId, comment_id: commentId, reason });
  if (error && error.code !== '23505') throw new Error(`Couldn't send the report: ${error.message}`);
}
