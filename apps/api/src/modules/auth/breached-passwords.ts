export const BREACHED_PASSWORDS = new Set([
  'password123!',
  'welcome123!',
  'qwerty123!',
  'letmein123!',
  'admin123!',
]);

export const isBreachedPassword = (password: string) => BREACHED_PASSWORDS.has(password.toLowerCase());
