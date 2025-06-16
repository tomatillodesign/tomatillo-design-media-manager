// Main app namespace
const tdMedia = {
	settings: {
		initialLoadCount: 24,
		cacheKey: 'tdmedia-cache',
		cacheMaxAgeMs: 1000 * 60 * 10, // 10 minutes
        fieldsParam: 'id,title,source_url,_avif_url,_webp_url,modified,date,alt_text,caption,description,_avif_size_kb,_webp_size_kb',

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

    // Create search box
    // Create search wrapper
    const searchWrap = document.createElement('div');
    searchWrap.style = 'margin-bottom: 1rem; position: relative;';

    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'tdmedia-search';
    searchInput.placeholder = 'Search by title, alt text, etc...';
    searchInput.style = `
        width: 100%;
        padding: 0.5rem 2.5rem 0.5rem 0.5rem;
        font-size: 14px;
        box-sizing: border-box;
    `;

    // Create clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '×';
    clearBtn.setAttribute('aria-label', 'Clear search');
    clearBtn.style = `
        position: absolute;
        right: 0.5rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        font-size: 18px;
        color: #666;
        cursor: pointer;
        display: none;
    `;

    // Add event listener to clear the input
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        renderGrid(tdMedia.state.items);
        renderStatus('Search cleared (showing all items)');
    });

    // Show/hide clear button as user types
    searchInput.addEventListener('input', () => {
        clearBtn.style.display = searchInput.value.length ? 'block' : 'none';
    });

    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(clearBtn);
    tdMedia.elements.app.appendChild(searchWrap);

    searchWrap.appendChild(searchInput);
    tdMedia.elements.app.appendChild(searchWrap);

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
    setupSearchInput();

    // Step 2: fetch most recent 24 fresh
    fetch(`/wp-json/wp/v2/media?per_page=24&orderby=date&order=desc&_fields=${tdMedia.settings.fieldsParam}`)
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

            // Optional: sort by date uploaded (descending)
            merged.sort((a, b) => {
                const aDate = new Date(a.date || 0).getTime();
                const bDate = new Date(b.date || 0).getTime();
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
			`/wp-json/wp/v2/media?per_page=${tdMedia.settings.initialLoadCount}&orderby=date&order=desc&_fields=${tdMedia.settings.fieldsParam}`
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

	const getUploadLabel = dateStr => {
		const uploadDate = new Date(dateStr);
		const now = new Date();
		const deltaDays = Math.floor((now - uploadDate) / (1000 * 60 * 60 * 24));

		if (deltaDays < 1) return 'uploaded today';
		if (deltaDays < 7) return 'uploaded this week';
		if (deltaDays < 31) return 'uploaded this month';
		return 'uploaded a while ago';
	};

	items.forEach(item => {
		const div = document.createElement('div');
		div.style = 'width:300px;border:1px solid #ddd;padding:0.5rem;background:#fff;font-size:13px;';

		const uploadedLabel = item.date ? getUploadLabel(item.date) : '—';
		const uploadedDate = item.date ? new Date(item.date).toLocaleDateString() : '—';
		const modifiedDate = item.modified ? new Date(item.modified).toLocaleDateString() : '—';

		div.innerHTML = `
			<img src="${item.source_url}" style="max-width:100%;height:auto;display:block;" alt="">
			<div style="margin-top:0.5rem;">
				<strong>${item.title.rendered || '(No title)'}</strong>
				<span style="color: #999; font-size: 12px;">[${item._td_from_cache ? 'cached' : 'fresh'}]</span>
			</div>
			<code>${uploadedLabel}</code><br>
			<code>Uploaded: ${uploadedDate} | Modified: ${modifiedDate}</code><br>
			<code>AVIF: ${item._avif_url ? '✅' : '—'} | WebP: ${item._webp_url ? '✅' : '—'}</code>
		`;

		tdMedia.elements.grid.appendChild(div);
	});
}


/**
 * Render the dev-friendly status panel
 */
function renderStatus(msg) {
	const line = document.createElement('div');
	line.innerHTML = `<strong>${msg}</strong>`;
	tdMedia.elements.statusPanel.appendChild(line);
}





/**
 * Fetch all media items in the background via REST pagination
 */
async function startBackgroundLoad() {
	console.log('[TDMEDIA] Starting background load');
	const allItems = [];

	try {
		// Fetch page 1 and get totalPages from headers
		const firstResp = await fetch(`/wp-json/wp/v2/media?per_page=100&page=1&orderby=date&order=desc&_fields=${tdMedia.settings.fieldsParam}`);
		if (!firstResp.ok) throw new Error(`Failed to fetch page 1 (${firstResp.status})`);

		const firstPage = await firstResp.json();
		allItems.push(...firstPage);

		const totalPages = parseInt(firstResp.headers.get('X-WP-TotalPages') || '1', 10);
		console.log(`[TDMEDIA] Total pages to load: ${totalPages}`);

		// Fetch remaining pages
		for (let page = 2; page <= totalPages; page++) {
			const resp = await fetch(`/wp-json/wp/v2/media?per_page=100&page=${page}&orderby=date&order=desc&_fields=${tdMedia.settings.fieldsParam}`);
			if (!resp.ok) {
				console.warn(`[TDMEDIA] Page ${page} failed with status ${resp.status}`);
				break;
			}
			const batch = await resp.json();
			allItems.push(...batch);
			renderStatus(`Fetching… ${allItems.length} loaded`);
		}

		const totalMs = (performance.now() - tdMedia.state.startTime).toFixed(0);
		renderStatus(`Loaded all ${allItems.length} items in ${totalMs}ms`);

		saveToCache(allItems);

		// Only render if nothing was shown yet (i.e., no cache used)
		if (!tdMedia.state.items.length) {
			tdMedia.state.items = allItems;
			renderGrid(allItems);
		}

		// Now perform hydration diff
		hydrateFromRest();

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




/**
 * Check for updates and deleted media items by comparing REST meta
 */
async function hydrateFromRest() {
	console.log('[TDMEDIA] Hydration: Starting diff check');

	try {
		const liveIds = [];
		let page = 1;
		let totalPages = 1;

		// Step 1: fetch all IDs + modified timestamps
		while (page <= totalPages) {
			const resp = await fetch(`/wp-json/wp/v2/media?per_page=100&page=${page}&orderby=date&order=desc&_fields=id,modified`);
			if (!resp.ok) throw new Error(`Failed to fetch page ${page}: ${resp.status}`);

			const batch = await resp.json();
			const total = parseInt(resp.headers.get('X-WP-TotalPages') || '1', 10);
			totalPages = total;

			liveIds.push(...batch);
			page++;
		}

		// Step 2: map live data
		const liveMap = new Map(liveIds.map(i => [i.id, i.modified]));
		const cachedMap = new Map(tdMedia.state.items.map(i => [i.id, i.modified]));

		// Step 3: find diffs
		const updatedIds = [];
		const removedIds = [];

		liveMap.forEach((mod, id) => {
			if (!cachedMap.has(id)) {
				updatedIds.push(id); // new
			} else if (cachedMap.get(id) !== mod) {
				updatedIds.push(id); // changed
			}
		});

		cachedMap.forEach((_, id) => {
			if (!liveMap.has(id)) {
				removedIds.push(id); // deleted
			}
		});

		console.log(`[TDMEDIA] Hydration: ${updatedIds.length} updated, ${removedIds.length} removed`);

		// Step 4: re-fetch updated/new items
		const updatedItems = [];

        if (updatedIds.length === 0) {
            console.log('[TDMEDIA] No updates to fetch');
            applyHydrationUpdates([], removedIds);
            return;
        }

		const chunk = (arr, size) => arr.length <= size ? [arr] : arr.reduce((acc, _, i) => {
			if (i % size === 0) acc.push(arr.slice(i, i + size));
			return acc;
		}, []);

		for (const group of chunk(updatedIds, 20)) {
			const resp = await fetch(`/wp-json/wp/v2/media?include=${group.join(',')}&_fields=${tdMedia.settings.fieldsParam}`);
			if (resp.ok) {
				const batch = await resp.json();
				batch.forEach(i => i._td_from_cache = false); // mark fresh
				updatedItems.push(...batch);
			}
		}

		applyHydrationUpdates(updatedItems, removedIds);

	} catch (err) {
		console.error('[TDMEDIA] Hydration failed:', err);
	}
}


/**
 * Apply updated/deleted items to local state + cache
 */
function applyHydrationUpdates(updatedItems, removedIds) {

    console.log(`[TDMEDIA] applyHydrationUpdates called with: ${updatedItems.length} items, ${removedIds.length} removals`);

	const updatedMap = new Map(updatedItems.map(i => [i.id, i]));
	const filtered = tdMedia.state.items
		.filter(item => !removedIds.includes(item.id))
		.map(item => updatedMap.get(item.id) || item);

	// Add any brand-new items that didn’t exist at all
	updatedItems.forEach(item => {
		if (!filtered.some(existing => existing.id === item.id)) {
			filtered.push(item);
		}
	});

	// Re-sort and update using original upload date (not modified)
    filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

	tdMedia.state.items = filtered;
	saveToCache(filtered);
	renderGrid(filtered);

	renderStatus(`Hydration complete — ${updatedItems.length} updated, ${removedIds.length} removed`);
}



// Search functionality
function setupSearchInput() {
	const input = document.getElementById('tdmedia-search');
	if (!input) {
		console.warn('[TDMEDIA] Search input not found, skipping setup.');
		return;
	}

	console.log('[TDMEDIA] Search input found. Wiring up live search handler…');
	let searchTimeout = null;

	input.addEventListener('input', () => {
		const rawValue = input.value;
		clearTimeout(searchTimeout);

		searchTimeout = setTimeout(() => {
			const query = rawValue.trim().toLowerCase();

			if (query.length < 3) {
				renderGrid(tdMedia.state.items); // Show all
				renderStatus('Search cleared (showing all items)');
				return;
			}

			const filtered = tdMedia.state.items.filter(item => {
				const fields = [
                    (item?.title?.rendered || '') + '',
                    (item?.alt_text || '') + '',
                    (item?.description?.rendered || item?.description || '') + '',
                    (item?.caption?.rendered || item?.caption || '') + ''
                ];
				return fields.some(field => field.toLowerCase().includes(query));
			});

			renderGrid(filtered);
			renderStatus(`Search: Found ${filtered.length} result(s) for "${query}"`);
		}, 250);
	});
}




document.addEventListener('DOMContentLoaded', init);



