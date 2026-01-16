// Discrete Spotify Widget - Inline in home-info entry-content
const ENDPOINT = 'https://spotify-now-playing.xthehacker2000x.workers.dev/';

let widget = null;
let progressTimer = null;

// Helper: format ms to mm:ss
function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Create and inject the widget into the entry-content
function createWidget() {
  const entryContent = document.querySelector('.first-entry.home-info .entry-content');
  if (!entryContent) return null;

  const container = document.createElement('div');
  container.id = 'spotify-inline';
  container.className = 'spotify-inline';
  container.innerHTML = `
    <div class="spotify-label">Currently listening to:</div>
    <a id="spotify-link" class="spotify-link" href="#" target="_blank" rel="noopener">
      <div class="spotify-track">
        <span id="spotify-title" class="spotify-title">—</span>
        <span class="spotify-separator">—</span>
        <span id="spotify-artist" class="spotify-artist">—</span>
      </div>
    </a>
    <div class="spotify-progress-row">
      <span id="spotify-current" class="spotify-time spotify-time-current">0:00</span>
      <div class="spotify-progress-bar">
        <div id="spotify-progress" class="spotify-progress-fill"></div>
      </div>
      <span id="spotify-duration" class="spotify-time spotify-time-duration">0:00</span>
    </div>
  `;

  entryContent.appendChild(container);
  return container;
}

// Poll & render
async function fetchNowPlaying() {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-cache' });
    const data = await res.json();

    // Create widget on first successful fetch with data
    if (!widget) {
      widget = createWidget();
      if (!widget) {
        // entry-content not found, retry later
        setTimeout(fetchNowPlaying, 15000);
        return;
      }
    }

    // Case 1: nothing playing – hide widget
    if (!data.title) {
      widget.classList.remove('visible');
      clearInterval(progressTimer);
      setTimeout(fetchNowPlaying, 15000);
      return;
    }

    // Case 2: track found – show & populate
    widget.classList.add('visible');

    document.getElementById('spotify-title').textContent = data.title;
    document.getElementById('spotify-artist').textContent = data.artists;
    document.getElementById('spotify-duration').textContent = fmt(data.duration_ms);
    document.getElementById('spotify-link').href = data.url;

    // Progress handling
    clearInterval(progressTimer);
    const start = Date.now() - data.progress_ms;
    const dur = data.duration_ms;

    function tick() {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / dur, 1);
      document.getElementById('spotify-progress').style.width = `${pct * 100}%`;
      document.getElementById('spotify-current').textContent = fmt(elapsed);
      if (pct >= 1) {
        clearInterval(progressTimer);
        setTimeout(fetchNowPlaying, 3000); // wait 3s then refetch
      }
    }
    tick(); // initial paint
    progressTimer = setInterval(tick, 1000);
  } catch (err) {
    console.error('Spotify widget error:', err);
    if (widget) widget.classList.remove('visible');
    clearInterval(progressTimer);
    setTimeout(fetchNowPlaying, 30000);
  }
}

// Kick off
fetchNowPlaying();
