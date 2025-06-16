// Main app namespace
const tdMedia = {
	settings: {
		initialLoadCount: 24,
		cacheKey: 'tdmedia-cache',
		cacheMaxAgeMs: 1000 * 60 * 10, // 10 minutes
	},
	state: {
		items: [],
		startTime: null,
	},
	elements: {
		app: null,
		statusPanel: null,
		grid: null,
	},
};

/**
 * Init function: called on DOM ready
 */
function init() {
	console.log('[TDMEDIA] Init');
	tdMedia.state.startTime = performance.now();

	// Mount app container
	tdMedia.elements.app = document.getElementById('tdmedia-app');
	tdMedia.elements.app.innerHTML = ''; // Clean slate

	// Create status panel
	tdMedia.elements.statusPanel = document.createElement('div');
	tdMedia.elements.statusPanel.id = 'tdmedia-status';
	tdMedia.elements.statusPanel.style = 'padding:1rem;background:#f9f9f9;border:1px solid #ccc;margin-bottom:1rem;font-size:14px;';
	tdMedia.elements.app.appendChild(tdMedia.elements.statusPanel);

	// Create image grid
	tdMedia.elements.grid = document.createElement('div');
	tdMedia.elements.grid.id = 'tdmedia-grid';
	tdMedia.elements.grid.style = 'display:flex;flex-wrap:wrap;gap:1rem;';
	tdMedia.elements.app.appendChild(tdMedia.elements.grid);

	// Begin loading
    renderStatus('Loading most recent media...');

    // Step 1: load cache (if any)
    const cachedItems = loadFromCache() || [];

    document.body.style.cursor = 'progress'; // start

    // Step 2: fetch most recent 24 fresh
    fetch(`/wp-json/wp/v2/media?per_page=24&orderby=date&order=desc&_fields=id,title,source_url,_avif_url,_webp_url,modified`)
        .then(resp => resp.json())
        .then(freshItems => {
            // Tag all fresh
            freshItems.forEach(item => item._td_from_cache = false);

            // Step 3: Merge fresh + cached (excluding duplicates)
            const freshMap = new Map(freshItems.map(i => [i.id, i]));
            const merged = [...freshItems];

            cachedItems.forEach(item => {
                if (!freshMap.has(item.id)) {
                    item._td_from_cache = true;
                    merged.push(item);
                }
            });

            tdMedia.state.items = merged;

            // Optional: sort by modified time (descending)
            merged.sort((a, b) => {
                const aDate = new Date(a.modified || 0).getTime();
                const bDate = new Date(b.modified || 0).getTime();
                return bDate - aDate;
            });


            renderGrid(merged);
            renderStatus(`Loaded ${merged.length} items (24 fresh, ${cachedItems.length} cached)`);
            startBackgroundLoad(); // hydrates + updates cache
        })
        .catch(err => {
            console.error('[TDMEDIA] Failed to load initial 24:', err);
            renderStatus('❌ Failed to load media.');
        }).finally(() => {
		    document.body.style.cursor = ''; // Always reset cursor
	    });

}

/**
 * Fetch the most recent media items from the REST API
 */
async function fetchInitialBatch() {
	try {
		const response = await fetch(
			`/wp-json/wp/v2/media?per_page=${tdMedia.settings.initialLoadCount}&orderby=date&order=desc&_fields=id,title,source_url,_avif_url,_webp_url`
		);
		const items = await response.json();
		tdMedia.state.items = items;

		const elapsed = (performance.now() - tdMedia.state.startTime).toFixed(0);
		renderStatus(`Loaded ${items.length} items in ${elapsed}ms`);

		renderGrid(items);

        // ✅ START BACKGROUND LOAD HERE
		startBackgroundLoad();

	} catch (err) {
		console.error('[TDMEDIA] REST fetch error', err);
		renderStatus('❌ Failed to load media.');
	}
}

/**
 * Render the media items into the grid
 */
function renderGrid(items) {
	tdMedia.elements.grid.innerHTML = ''; // Clear existing
	items.forEach(item => {
	const div = document.createElement('div');
	div.style = 'width:300px;border:1px solid #ddd;padding:0.5rem;background:#fff;font-size:13px;';

	div.innerHTML = `
            <img src="${item.source_url}" style="max-width:100%;height:auto;display:block;" alt="">
            <div style="margin-top:0.5rem;">
                <strong>${item.title.rendered || '(No title)'}</strong>
                <span style="color: #999; font-size: 12px;">[${item._td_from_cache ? 'cached' : 'fresh'}]</span>
            </div>
            <code>AVIF: ${item._avif_url ? '✅' : '—'} | WebP: ${item._webp_url ? '✅' : '—'}</code>
        `;

        tdMedia.elements.grid.appendChild(div);
    });

}

/**
 * Render the dev-friendly status panel
 */
function renderStatus(msg) {
	tdMedia.elements.statusPanel.innerHTML = `<strong>${msg}</strong>`;
}




/**
 * Fetch all media items in the background via REST pagination
 */
async function startBackgroundLoad() {
	console.log('[TDMEDIA] Starting background load');
	const allItems = [];

	try {
		// Fetch page 1 and check total pages
		const firstResp = await fetch(`/wp-json/wp/v2/media?per_page=100&page=1&orderby=date&order=desc&_fields=id,title,source_url,_avif_url,_webp_url,modified`);
		if (!firstResp.ok) throw new Error(`Failed to fetch page 1 (${firstResp.status})`);
		
		const firstPage = await firstResp.json();
		allItems.push(...firstPage);

		const totalPages = parseInt(firstResp.headers.get('X-WP-TotalPages') || '1', 10);
		console.log(`[TDMEDIA] Total pages to load: ${totalPages}`);

		// Fetch remaining pages
		for (let page = 2; page <= totalPages; page++) {
			const resp = await fetch(`/wp-json/wp/v2/media?per_page=100&page=${page}&orderby=date&order=desc&_fields=id,title,source_url,_avif_url,_webp_url,modified`);
			if (!resp.ok) {
				console.warn(`[TDMEDIA] Page ${page} failed with status ${resp.status}`);
				break;
			}
			const batch = await resp.json();
			allItems.push(...batch);
			renderStatus(`Fetching… ${allItems.length} loaded`);
		}

		tdMedia.state.items = allItems;

		const totalMs = (performance.now() - tdMedia.state.startTime).toFixed(0);
		renderStatus(`Loaded all ${allItems.length} items in ${totalMs}ms`);

		saveToCache(allItems);

        if (!tdMedia.state.items.length) {
            // Only render if nothing has been shown yet (i.e. no cache was used)
            tdMedia.state.items = allItems;
            renderGrid(allItems);
        }

	} catch (err) {
		console.error('[TDMEDIA] Error during background load:', err);
		renderStatus('❌ Error during background load.');
	}
}


/**
 * Save media items to LocalStorage with a timestamp
 */
function saveToCache(items) {
	try {
		const data = {
			timestamp: Date.now(),
			items: items,
		};
		localStorage.setItem(tdMedia.settings.cacheKey, JSON.stringify(data));
		console.log(`[TDMEDIA] Saved ${items.length} items to cache`);
	} catch (err) {
		console.warn('[TDMEDIA] Failed to save to cache:', err);
	}
}


/**
 * Attempt to load cached media items from LocalStorage
 */
function loadFromCache() {
	try {
		const raw = localStorage.getItem(tdMedia.settings.cacheKey);
		if (!raw) return null;

		const parsed = JSON.parse(raw);
		const age = Date.now() - parsed.timestamp;

		if (age > tdMedia.settings.cacheMaxAgeMs) {
			console.log('[TDMEDIA] Cache found but expired');
			return null;
		}

		console.log(`[TDMEDIA] Loaded ${parsed.items.length} items from cache`);
		// Tag as from cache
        parsed.items.forEach(item => item._td_from_cache = true);
        return parsed.items;


	} catch (err) {
		console.warn('[TDMEDIA] Failed to read from cache:', err);
		return null;
	}
}



document.addEventListener('DOMContentLoaded', init);



