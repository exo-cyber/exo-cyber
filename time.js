function fmtDuration(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];

  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);

  if (!parts.length) {
    parts.push(`${secs} second${secs === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
}

module.exports = { fmtDuration };
