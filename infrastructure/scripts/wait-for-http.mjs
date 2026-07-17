const [url, timeoutText = '60000'] = process.argv.slice(2);

if (!url) {
  throw new Error('Usage: node wait-for-http.mjs <url> [timeoutMs]');
}

const deadline = Date.now() + Number(timeoutText);
let lastError;

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) process.exit(0);
    lastError = new Error(`HTTP ${response.status}`);
  } catch (error) {
    lastError = error;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

throw lastError ?? new Error(`Timed out waiting for ${url}`);
