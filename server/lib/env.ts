// Server-only env access. Never import from a "use client" component.
// Throws at first use if a required variable is missing.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  get SHARED_SECRET() {
    return required('SHARED_SECRET');
  },
  get INFERENCE_BASE_URL() {
    return required('INFERENCE_BASE_URL').replace(/\/+$/, '');
  },
  get DATABASE_PATH() {
    return process.env.DATABASE_PATH || './data.sqlite';
  },
  get FAL_KEY() {
    return process.env.FAL_KEY || '';
  },
};
