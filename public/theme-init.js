try {
  const preference = localStorage.getItem('gauge:theme') || 'system';
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePref = preference;
} catch {
  document.documentElement.dataset.theme = 'light';
  document.documentElement.dataset.themePref = 'system';
}
