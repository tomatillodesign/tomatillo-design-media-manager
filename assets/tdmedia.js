// Main app namespace
const tdMedia = {
	settings: {
		initialLoadCount: 24,
		cacheKey: 'tdmedia-cache',
		cacheMaxAgeMs: 1000 * 60 * 10, // 10 minutes
        fieldsParam: 'id,title,source_url,media_details,mime_type,_avif_url,_webp_url,modified,date,alt_text,caption,description,_avif_size_kb,_webp_size_kb',

	},
	state: {
		items: [],
		startTime: null,
        viewMode: 'images', // 🆕 default to images
	},
	elements: {
		app: null,
		statusPanel: null,
		grid: null,
	},
};

// Store all loaded items globally for modal navigation
let tdmediaItems = [];


/* A few helpers ----- */
function getFlexBasis(width, height, targetRowHeight = 360) {
	const aspectRatio = width / height;
	return +(targetRowHeight * aspectRatio).toFixed(2);
}

function formatDate(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}





function createTdMediaItem(item, basis, index = 0) {
	const div = document.createElement('div');
	div.className = 'tdmedia-item';
	div.style.flexBasis = `${basis}px`;
	div.style.height = '360px';

	const width = item.media_details?.width || '—';
	const height = item.media_details?.height || '—';
	const filename = item.title?.rendered || '(No name)';
	const uploaded = new Date(item.date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});

	let displayType = 'Original — ' + (item.mime_type || 'image/jpeg');
	let fileSizeKb = Math.round((item.media_details?.filesize || 0) / 1024) || '—';

	if (item._avif_url) {
		displayType = 'AVIF';
		fileSizeKb = item._avif_size_kb || fileSizeKb;
	} else if (item._webp_url) {
		displayType = 'WebP';
		fileSizeKb = item._webp_size_kb || fileSizeKb;
	}

	div.innerHTML = `
		<div class="tdmedia-img-wrapper">
			<img
				src="${item.source_url}"
				alt="${item.alt_text || filename}"
				loading="lazy"
				decoding="async"
			/>
		</div>
		<div class="tdmedia-overlay">
			<div class="tdmedia-title">${filename}</div>
            <div class="tdmedia-counter">#${index}</div>
			<div>ID: ${item.id}</div>
			<div>Type: ${displayType}</div>
			<div>File: ${fileSizeKb} KB</div>
			<div>Uploaded: ${uploaded}</div>
			<div>Source: ${item._td_from_cache ? '🧊 Cache' : '🔥 Fresh'}</div>
		</div>
	`;

	// Optional alt + caption hover
	const rawCaption = item.caption?.rendered || '';
	const cleanCaption = rawCaption.replace(/^<p>(.*?)<\/p>$/i, '$1');
	const overlay = div.querySelector('.tdmedia-overlay');
	if (overlay) {
		const metaDetails = document.createElement('div');
		metaDetails.className = 'tdmedia-meta-extras';
		metaDetails.style.marginTop = '0.5rem';
		metaDetails.innerHTML = `
			<div><strong>Alt:</strong> ${item.alt_text || '<em>none</em>'}</div>
			<div class="tdmedia-overlay-caption"><strong>Caption:</strong> ${cleanCaption || '<em>none</em>'}</div>
		`;
		overlay.appendChild(metaDetails);
	}

	// 🔥 Modal click: clean and delegated
	div.addEventListener('click', () => {
		console.log('[TDMEDIA] Opening modal for ID:', item.id);
		window.tdmediaCurrentIndex = tdmediaItems.findIndex(i => i.id === item.id);
		openTdMediaModal(item);
	});

	return div;
}



function openTdMediaModal(item) {
	console.log('[TDMEDIA] Injecting modal for:', item);
	document.getElementById('tdmedia-modal')?.remove();

	const filename = item.title?.rendered || '(No name)';
	const rawCaption = item.caption?.rendered || '';
	const strippedCaption = rawCaption.trim().replace(/^<p>([\s\S]*?)<\/p>$/i, '$1');

	const hasDimensions = item.media_details?.width && item.media_details?.height;
	const width = hasDimensions ? item.media_details.width : null;
	const height = hasDimensions ? item.media_details.height : null;

	const fileSizeKb = Math.round((item.media_details?.filesize || 0) / 1024);
	const readableSize = fileSizeKb >= 1024
		? `${(fileSizeKb / 1024).toFixed(1)} MB`
		: `${fileSizeKb} KB`;

	const uploaded = new Date(item.date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});

	let displayType = 'Original — ' + (item.mime_type || 'image/jpeg');
	let imageUrl = null;

    if (item.mime_type?.startsWith('image/')) {
        imageUrl = item._avif_url || item._webp_url || item.source_url;
    } else if (item.mime_type === 'application/pdf') {
        imageUrl = item.media_details?.sizes?.full?.source_url || null;
    }

    const fallbackIcon = getIconClassForMime(item.mime_type);

	const modal = document.createElement('div');
    modal.id = 'tdmedia-modal';
    const viewClass = item.mime_type?.startsWith('image/') ? 'is-image' : 'is-file';
    modal.className = `tdmedia-modal-wrapper ${viewClass}`;

	modal.innerHTML = `
		<div class="tdmedia-modal-overlay"></div>
		<div class="tdmedia-modal-content" role="dialog" aria-modal="true">
			<div class="tdmedia-modal-left">
				<div class="tdmedia-modal-image">
                    ${imageUrl
                        ? `<img src="${imageUrl}" alt="${item.alt_text || filename}" />`
                        : `<span class="dashicons ${fallbackIcon}" style="font-size: 96px; color: #666;"></span>`
                    }
                </div>
			</div>
			<div class="tdmedia-modal-right">
				<h2>${filename}</h2>
				<ul class="tdmedia-meta-list">
					<li><strong>ID:</strong> ${item.id}</li>
					<li><strong>Type:</strong> ${displayType}</li>
					${item.mime_type?.startsWith('image/')
                        ? `<li><strong>Size:</strong> ${width && height ? `${width}×${height}` : '—'}</li>`
                        : ''
                    }
					<li><strong>File:</strong> ${readableSize}</li>
					<li><strong>Uploaded:</strong> ${uploaded}</li>
					<li><strong>URL:</strong> <span class="clb-pre">${imageUrl}</span></li>
					<li><strong>Original File:</strong> <span class="clb-pre">${item.source_url}</span></li>
				</ul>

				<div class="tdmedia-actions">
					<button type="button" id="tdmedia-copy-url">Copy Image URL</button>
					<a id="tdmedia-download-link" href="${item.source_url}" download target="_blank" rel="noopener">
						<button type="button">Download Original File</button>
					</a>
				</div>

				<form id="tdmedia-meta-form">
					<div class="tdmedia-form-group">
						<label for="tdmedia-alt">Alt Text</label>
						<input type="text" id="tdmedia-alt" name="alt_text" value="${item.alt_text || ''}" />
					</div>

					<div class="tdmedia-form-group">
						<label for="tdmedia-caption">Caption</label>
						<textarea id="tdmedia-caption" name="caption" rows="2">${strippedCaption}</textarea>
					</div>

					<div class="tdmedia-close-modal-wrapper">
						<button type="submit" id="tdmedia-save-meta">Save Metadata</button>
						<button id="tdmedia-close-modal" type="button" class="tdmedia-close-btn">Close</button>
					</div>
				</form>

				<div class="tdmedia-modal-nav">
					<button id="tdmedia-prev" ${window.tdmediaCurrentIndex === 0 ? 'disabled' : ''}>&larr; Prev</button>
					<button id="tdmedia-next" ${window.tdmediaCurrentIndex === tdmediaItems.length - 1 ? 'disabled' : ''}>Next &rarr;</button>
				</div>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	// Close actions
	const closeModal = () => modal.remove();
	modal.querySelector('.tdmedia-modal-overlay')?.addEventListener('click', closeModal);
	modal.querySelector('#tdmedia-close-modal')?.addEventListener('click', closeModal);
	document.addEventListener('keydown', function escClose(e) {
		if (e.key === 'Escape') {
			closeModal();
			document.removeEventListener('keydown', escClose);
		}
	});

	// Copy URL
	const copyBtn = document.getElementById('tdmedia-copy-url');
	copyBtn?.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(imageUrl);
			copyBtn.textContent = 'Copied!';
			setTimeout(() => (copyBtn.textContent = 'Copy Image URL'), 1500);
		} catch (err) {
			console.error('[TDMEDIA] Copy failed:', err);
			copyBtn.textContent = 'Failed to copy';
		}
	});

	// Save alt/caption
	document.getElementById('tdmedia-meta-form')?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const alt = document.getElementById('tdmedia-alt').value.trim();
		const caption = document.getElementById('tdmedia-caption').value.trim();
		const saveBtn = document.getElementById('tdmedia-save-meta');
		saveBtn.disabled = true;
		saveBtn.textContent = 'Saving…';

		try {
			const res = await wp.apiFetch({
				path: `/wp/v2/media/${item.id}`,
				method: 'POST',
				data: {
					alt_text: alt,
					caption: caption,
				}
			});
			console.log('[TDMEDIA] Metadata saved:', res);
			saveBtn.textContent = 'Saved!';
			setTimeout(() => {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Save Metadata';
			}, 1500);
		} catch (err) {
			console.error('[TDMEDIA] Save error:', err);
			saveBtn.textContent = 'Error';
			saveBtn.disabled = false;
		}
	});

	// Prev/Next
	document.getElementById('tdmedia-prev')?.addEventListener('click', () => {
		if (window.tdmediaCurrentIndex > 0) {
			window.tdmediaCurrentIndex--;
			openTdMediaModal(tdmediaItems[window.tdmediaCurrentIndex]);
		}
	});
	document.getElementById('tdmedia-next')?.addEventListener('click', () => {
		if (window.tdmediaCurrentIndex < tdmediaItems.length - 1) {
			window.tdmediaCurrentIndex++;
			openTdMediaModal(tdmediaItems[window.tdmediaCurrentIndex]);
		}
	});
}







/**
 * Init function: called on DOM ready
 */
function init() {
	console.log('[TDMEDIA] Init');
	tdMedia.state.startTime = performance.now();

	// Mount app container
	tdMedia.elements.app = document.getElementById('tdmedia-content');
	tdMedia.elements.app.innerHTML = ''; // Clean slate

	// Create status panel
	tdMedia.elements.statusPanel = document.createElement('div');
	tdMedia.elements.statusPanel.id = 'tdmedia-status';
	tdMedia.elements.statusPanel.style = 'padding:1rem;background:#f9f9f9;border:1px solid #ccc;margin-bottom:1rem;font-size:14px;';
	tdMedia.elements.app.appendChild(tdMedia.elements.statusPanel);

    const statusPanel = document.getElementById('tdmedia-status');

    if (statusPanel) {
        const clearCacheBtn = document.createElement('button');
        clearCacheBtn.id = 'tdmedia-clear-cache';
        clearCacheBtn.textContent = '🧹 Clear Cache';
        clearCacheBtn.style = `
            margin-left: auto;
            padding: 0.4rem 0.75rem;
            font-size: 12px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
        `;

        clearCacheBtn.addEventListener('click', () => {
            if (confirm('Clear all cached media data? This will force a fresh reload.')) {
                localStorage.clear();
                console.log('[TDMEDIA] Local storage cleared.');
                location.reload();
            }
        });

        statusPanel.appendChild(clearCacheBtn);
    } else {
        console.warn('[TDMEDIA] No status panel found for Clear Cache button.');
    }

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
	tdMedia.elements.grid.style = 'display:flex;flex-wrap:wrap;gap:16px;';
	tdMedia.elements.app.appendChild(tdMedia.elements.grid);

	// Begin loading
    renderStatus('Loading most recent media...');

    // Step 1: load cache (if any)
    const cachedItems = loadFromCache() || [];

    document.body.style.cursor = 'progress'; // start
    setupSearchInput();
    renderViewToggle();

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
            tdmediaItems = merged;
        })
        .catch(err => {
            console.error('[TDMEDIA] Failed to load initial 24:', err);
            renderStatus('❌ Failed to load media.');
        }).finally(() => {
		    document.body.style.cursor = ''; // Always reset cursor
	    });

        const statusEl = document.getElementById('tdmedia-status');
        setupUploadZone(statusEl, fetchInitialBatch);

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

        console.log(items);

		renderGrid(items);

        // ✅ START BACKGROUND LOAD HERE
		startBackgroundLoad();

	} catch (err) {
		console.error('[TDMEDIA] REST fetch error', err);
		renderStatus('❌ Failed to load media.');
	}
}





function renderGrid(items) {

    const appRoot = document.getElementById('tdmedia-content');
    if (appRoot) {
        appRoot.classList.remove('tdmedia-view-files', 'tdmedia-view-images');
        appRoot.classList.add(
            tdMedia.state.viewMode === 'files' ? 'tdmedia-view-files' : 'tdmedia-view-images'
        );
    }

	if (tdMedia.state.viewMode === 'images') {
		const images = items.filter(i => i.mime_type?.startsWith('image/'));
		layoutRows(images, true);
	} else {
		const files = items.filter(i => !i.mime_type?.startsWith('image/'));
		renderFileList(files);
	}
}



function getIconClassForMime(mime) {
	if (mime.includes('pdf')) return 'dashicons-media-document';
	if (mime.includes('word')) return 'dashicons-media-text';
	if (mime.includes('zip')) return 'dashicons-media-archive';
	if (mime.includes('audio')) return 'dashicons-media-audio';
	if (mime.includes('video')) return 'dashicons-media-video';
	return 'dashicons-media-default';
}

function getFriendlyExtension(mime = '') {
	const extMap = {
		'application/pdf': 'pdf',
		'application/zip': 'zip',
		'application/msword': 'doc',
		'application/vnd.ms-excel': 'xls',
		'application/vnd.ms-powerpoint': 'ppt',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	};

	if (extMap[mime]) return extMap[mime];

	const guess = mime.split('/')[1] || '';
	return guess.length > 6 ? guess.slice(0, 6).toLowerCase() : guess.toLowerCase();
}




function renderFileList(files) {
	const grid = tdMedia.elements.grid;
	grid.innerHTML = '';

	const gridWrap = document.createElement('div');
	gridWrap.className = 'tdmedia-file-grid';

	files.forEach(file => {
		const div = document.createElement('div');
		div.className = 'tdmedia-file-card';

		const filename = file.title?.rendered || '(No name)';
        div.title = filename;
		const mime = file.mime_type || 'Unknown';
        const ext = getFriendlyExtension(mime);
        const uploaded = new Date(file.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const fileSizeKb = Math.round((file.media_details?.filesize || 0) / 1024);
        const readableSize = fileSizeKb >= 1024
            ? `${(fileSizeKb / 1024).toFixed(1)} MB`
            : `${fileSizeKb} KB`;


		let thumbUrl = '';
		if (mime === 'application/pdf') {
			thumbUrl = file.media_details?.sizes?.full?.source_url || '';
		}

		const iconClass = getIconClassForMime(mime);

		div.innerHTML = `
			<div class="tdmedia-file-thumb">
				${thumbUrl ? `<img src="${thumbUrl}" alt="${filename}" />`
				           : `<span class="dashicons ${iconClass}"></span>`}
			</div>
			<div class="tdmedia-file-info">
                <div class="tdmedia-file-name">${filename}</div>
                <div class="tdmedia-file-type">${ext.toUpperCase()}</div>
                <div class="tdmedia-file-type">${readableSize}</div>
                <div class="tdmedia-file-meta">${uploaded}</div>
            </div>

		`;

		div.addEventListener('click', () => openTdMediaModal(file));

		gridWrap.appendChild(div);
	});

	grid.appendChild(gridWrap);
}






function layoutRows(items, clear = true) {

	const grid = tdMedia.elements.grid;
	if (clear) grid.innerHTML = '';

	let currentRow = [];
	let rowWidth = 0;
	const maxRowWidth = grid.clientWidth || 1000;
	const targetRowHeight = 360;
	const spacing = 16;

	items.forEach((item, index) => {

        // Sanity check: log mime type and ID
	console.log(`[TDMEDIA] Processing item ID: ${item.id}, mime: ${item.mime_type}`);

	// Skip if not a photo
	if (!item.mime_type || !item.mime_type.startsWith('image/')) {
		console.log(`[TDMEDIA] Skipped non-image item ID: ${item.id}`);
		return;
	}

		const w = item.media_details?.width || 1;
		const h = item.media_details?.height || 1;
		let ar = w / h;
		if (ar < 0.75) ar *= 1.33; // vertical boost

		const scaledWidth = targetRowHeight * ar;

		currentRow.push({ item, boostedAR: ar });
		rowWidth += scaledWidth + spacing;

		const isLast = index === items.length - 1;
		if (rowWidth >= maxRowWidth || isLast) {
			const row = document.createElement('div');
			row.className = 'tdmedia-row';

			if (isLast && rowWidth < maxRowWidth) {
				// Ragged edge row – no shrinking
				currentRow.forEach(({ item, boostedAR }, i) => {
					const basis = targetRowHeight * boostedAR;
					row.appendChild(createTdMediaItem(item, basis, index - currentRow.length + 1 + i));
				});
			} else {
				// Normal row – shrink to fit
				const totalScaled = currentRow.reduce((sum, i) => sum + (targetRowHeight * i.boostedAR), 0);
				const shrinkRatio = (maxRowWidth - spacing * (currentRow.length - 1)) / totalScaled;

				currentRow.forEach(({ item, boostedAR }, i) => {
					const basis = targetRowHeight * boostedAR * shrinkRatio;
					row.appendChild(createTdMediaItem(item, basis, index - currentRow.length + 1 + i));
				});
			}

			grid.appendChild(row);
			currentRow = [];
			rowWidth = 0;
		}
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


function renderViewToggle() {
	const existing = document.getElementById('tdmedia-view-toggle');
	if (existing) existing.remove();

	const wrap = document.createElement('div');
	wrap.id = 'tdmedia-view-toggle';
	wrap.style = `
        display: inline-flex;
        border: 1px solid #ccc;
        border-radius: 6px;
        overflow: hidden;
        margin-bottom: 1rem;
    `;


	const views = [
        { key: 'images', label: 'Images', icon: 'dashicons-format-image' },
        { key: 'files', label: 'Files', icon: 'dashicons-media-document' },
    ];


	views.forEach(view => {
		const btn = document.createElement('button');
		btn.innerHTML = `
            <span class="dashicons ${view.icon}" style="margin-right: 0.5em;"></span>
            ${view.label}
        `;
		btn.dataset.view = view.key;
		btn.style = `
            border: none;
            background: ${tdMedia.state.viewMode === view.key ? '#2363e0' : '#f1f1f1'};
            color: ${tdMedia.state.viewMode === view.key ? '#fff' : '#000'};
            padding: 0.5rem 1rem;
            cursor: pointer;
            font-size: 24px;
            display: flex;
            align-items: center;
            white-space: nowrap;
        `;

        if (tdMedia.state.viewMode !== view.key) {
            btn.style.borderRight = '1px solid #ccc';
        }

		btn.addEventListener('click', () => {
			tdMedia.state.viewMode = view.key;
			renderGrid(tdMedia.state.items); // 🔁 re-render based on view
			renderViewToggle(); // 🔁 re-render buttons
			renderStatus(`Switched to "${view.label}" view`);
		});

		wrap.appendChild(btn);
	});

	// Insert right after searchWrap
	const searchWrap = document.getElementById('tdmedia-search')?.parentElement;
	if (searchWrap) {
		searchWrap.insertAdjacentElement('afterend', wrap);
	}
}



function setupUploadZone(statusEl, fetchMedia) {
	const zone = document.getElementById('tdmedia-upload-zone');
	const overlay = document.getElementById('tdmedia-uploading-overlay');
	const overlayBar = document.getElementById('tdmedia-progress-bar-inner-overlay');
	const toolbarWrapper = document.getElementById('tdmedia-progress-wrapper');
	const toolbarBar = document.getElementById('tdmedia-progress-bar-inner');

	// Highlight drop zone
	['dragenter', 'dragover'].forEach(event => {
		zone.addEventListener(event, e => {
			e.preventDefault();
			e.stopPropagation();
			zone.classList.add('drag-over');
		});
	});

	// Remove highlight
	['dragleave', 'drop'].forEach(event => {
		zone.addEventListener(event, e => {
			e.preventDefault();
			e.stopPropagation();
			zone.classList.remove('drag-over');
		});
	});

	// Handle drop
	zone.addEventListener('drop', async e => {
		e.preventDefault();
		e.stopPropagation();

        document.body.style.cursor = 'wait';

		const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
		if (files.length === 0) return;

		statusEl.textContent = `Uploading ${files.length} image(s)…`;

		// Show UI
		document.body.classList.add('tdmedia-uploading');
		overlay.style.display = 'flex';
		toolbarWrapper.style.display = 'block';
		overlayBar.style.width = '0%';
		toolbarBar.style.width = '0%';

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const formData = new FormData();
			formData.append('file', file);
			formData.append('title', file.name);

			try {
				await wp.apiFetch({
					path: '/wp/v2/media',
					method: 'POST',
					body: formData,
					headers: {
						'Content-Disposition': `attachment; filename="${file.name}"`
					}
				});
			} catch (err) {
				console.error('[TDMEDIA] Upload error:', err);
			}

			const pct = Math.round(((i + 1) / files.length) * 100);
			overlayBar.style.width = `${pct}%`;
			toolbarBar.style.width = `${pct}%`;
		}

		// Done
		document.body.classList.remove('tdmedia-uploading');
		overlay.style.display = 'none';
		toolbarWrapper.style.display = 'none';
		statusEl.textContent = 'Upload complete. Refreshing…';

		await fetchMedia(); // re-fetch latest media
        document.body.style.cursor = ''; // reset to default

	});


}





document.addEventListener('DOMContentLoaded', init);


