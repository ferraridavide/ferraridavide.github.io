// JavaScript
const ENDPOINT = 'https://spotify-now-playing.xthehacker2000x.workers.dev/';
const widget    = document.getElementById('now-playing');
const cover     = document.getElementById('cover');
const smallText = document.getElementById('small-text');
const titleEl   = document.getElementById('title');
const artistEl  = document.getElementById('artist');
const currentEl = document.getElementById('current');
const durationEl= document.getElementById('duration');
const progressEl= document.getElementById('progress');
const songLinks = document.querySelectorAll('.song-link');

let progressTimer = null;

/* helper: mm:ss */
function fmt(ms){
  const s=Math.floor(ms/1000), m=Math.floor(s/60);
  return `${m}:${String(s%60).padStart(2,'0')}`;
}

/* poll & render */
async function fetchNowPlaying(){
  try{
    const res  = await fetch(ENDPOINT,{cache:'no-cache'});
    const data = await res.json();

    // Case 1: nothing meaningful playing – hide widget
    if(!data.title){
      widget.classList.add('hidden');
      clearInterval(progressTimer);
      setTimeout(fetchNowPlaying,15_000);   // try again in 15 s
      return;
    }

    // Case 2: track found – show & populate
    widget.classList.remove('hidden');
    smallText.innerHTML = `I'm&nbsp;currently&nbsp;listening:&nbsp;<br><strong>${data.title}</strong> by ${data.artists}`;
    titleEl.textContent  = data.title;
    artistEl.textContent = data.artists;
    durationEl.textContent = fmt(data.duration_ms);
    cover.style.backgroundImage = `url('${data.albumArt}')`;
    songLinks.forEach(link => link.href = data.url);

    // progress handling
    clearInterval(progressTimer);
    const start = Date.now() - data.progress_ms;
    const dur   = data.duration_ms;

    function tick(){
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / dur, 1);
      progressEl.style.width = `${pct*100}%`;
      currentEl.textContent  = fmt(elapsed);
      if(pct >= 1){
        clearInterval(progressTimer);
        setTimeout(fetchNowPlaying, 3_000); // wait 3 s then refetch
      }
    }
    tick();                                // initial paint
    progressTimer = setInterval(tick, 1_000);
  }catch(err){
    console.error(err);
    widget.classList.add('hidden');
    clearInterval(progressTimer);
    setTimeout(fetchNowPlaying,30_000);
  }
}

/* kick off */
fetchNowPlaying();
