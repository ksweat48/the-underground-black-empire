export function parseSupabaseError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: string }).message;
    if (msg.includes('User already registered')) {
      return 'An account with this email already exists.';
    }
    if (msg.includes('Invalid login credentials')) {
      return 'Incorrect email or password.';
    }
    if (msg.includes('weak') || msg.includes('easy to guess') || msg.includes('leaked')) {
      return 'That password was rejected by our security check. Please try a different password.';
    }
    if (msg.includes('Password should be at least')) {
      return 'Password must be at least 6 characters.';
    }
    if (msg.includes('Email rate limit') || msg.includes('rate limit')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (msg.includes('idx_market_listings_owner_name_active') || msg.includes('duplicate key value')) {
      return 'You already have a listing with this name. Use the Marketplace to edit your existing listing.';
    }
    return msg;
  }
  return 'An unexpected error occurred. Please try again.';
}
