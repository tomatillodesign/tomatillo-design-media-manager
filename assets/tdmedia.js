(function () {
	console.log('[TDMEDIA] Booting Justified Row Masonry Layout…');
   
    // Safety reset if previous upload didn't clear state
	document.body.classList.remove('tdmedia-uploading');

	// Helpers
	function formatBytes(bytes) {
		if (!bytes) return '—';
		const units = ['B', 'KB', 'MB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / 1024 ** i).toFixed(0)} ${units[i]}`;
	}

	function formatDate(dateString) {
		const d = new Date(dateString);
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

    function stripHTMLTags(html) {
        if (!html) return '';
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    function stripOuterPTagsOnly(str) {
        if (!str) return '';
        const trimmed = str.trim();

        // Match only if the entire string is wrapped in a single <p>...</p>
        const match = trimmed.match(/^<p>(.*?)<\/p>$/i);
        return match ? match[1].trim() : trimmed;
    }




	const app = document.getElementById('tdmedia-app');
	if (!app) return;

	app.innerHTML = `
        <div class="tdmedia-toolbar">
            <button id="tdmedia-refresh">Refresh</button>
            <input type="search" id="tdmedia-search" placeholder="Search images…" style="flex: 1; margin: 0 1rem; padding: 0.5rem;">
            <span id="tdmedia-status">Ready.</span>
        </div>

        <div id="tdmedia-progress-wrapper" style="display: none; margin: 0.5rem 0;">
            <div id="tdmedia-progress-bar" style="background: #ccc; border-radius: 4px; overflow: hidden; height: 10px;">
                <div id="tdmedia-progress-bar-inner" style="background: #2363e0; width: 0%; height: 100%; transition: width 0.3s ease;"></div>
            </div>
        </div>

        <div id="tdmedia-upload-zone" class="tdmedia-upload-zone">
            Drag & drop images here to upload
        </div>

        <div id="tdmedia-uploading-overlay" class="tdmedia-overlay-ui" style="display: none;">
            <div class="tdmedia-overlay-content">
                <div class="tdmedia-overlay-text">Uploading…</div>
                <div id="tdmedia-overlay-progress-bar">
                    <div id="tdmedia-progress-bar-inner-overlay"></div>
                </div>
            </div>
        </div>

        <div id="tdmedia-grid"></div>
    `;

    // Inject loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'tdmedia-loading-overlay';
    loadingOverlay.innerHTML = `<div class="spinner" aria-label="Loading…"></div>`;
    document.body.appendChild(loadingOverlay);

    // Show/hide helpers
    function showLoading() {
        loadingOverlay.classList.add('visible');
    }

    function hideLoading() {
        loadingOverlay.classList.remove('visible');
    }

	const grid = document.getElementById('tdmedia-grid');
	const status = document.getElementById('tdmedia-status');

    let photoItems = [];

	async function fetchMedia() {
        showLoading();
		status.textContent = 'Loading media…';
		grid.innerHTML = '';

		try {
			const response = await wp.apiFetch({
				path: '/wp/v2/media?per_page=100&orderby=date&order=desc&_fields=id,title,source_url,media_type,mime_type,media_details,date,alt_text,caption,description'
			});
			const images = response.filter(item => item.mime_type?.startsWith('image/'));

			const metaResponses = await Promise.all(
                images.map(img => wp.apiFetch({ path: `/wp/v2/media/${img.id}` }))
            );

            photoItems = images.map((item, i) => {
                const meta = metaResponses[i];
                const { id, source_url, title, mime_type, media_details, date } = item;

                const avifUrl = meta.meta?._avif_url || null;
                const avifSizeKb = parseInt(meta.meta?._avif_size_kb || 0, 10);
                const webpUrl = meta.meta?._webp_url || null;
                const webpSizeKb = parseInt(meta.meta?._webp_size_kb || 0, 10);
                const scaledSizeBytes = parseInt(meta.meta?._scaled_size || 0, 10);

                let finalUrl = source_url;
                let finalLabel = 'Original';
                let finalSize = media_details.filesize || 0;

                if (avifUrl && avifSizeKb > 0) {
                    finalUrl = avifUrl;
                    finalLabel = 'AVIF';
                    finalSize = avifSizeKb * 1024;
                } else if (webpUrl && webpSizeKb > 0) {
                    finalUrl = webpUrl;
                    finalLabel = 'WebP';
                    finalSize = webpSizeKb * 1024;
                } else if (scaledSizeBytes > 0) {
                    finalLabel = 'Scaled JPG';
                    finalSize = scaledSizeBytes;
                }

                const alt = stripHTMLTags(meta?.alt_text || '');
                const caption = stripOuterPTagsOnly(meta.caption?.rendered || '');

                console.log('[TDMEDIA] ALT:', alt);
                console.log('[TDMEDIA] Raw caption:', meta.caption?.rendered);
                console.log('[TDMEDIA] Cleaned caption:', caption);

                return {
                    id,
                    title,
                    mime_type,
                    finalUrl,
                    finalLabel,
                    finalSize,
                    date,
                    alt_text: alt,
                    caption: caption,
                    width: media_details.width,
                    height: media_details.height
                };

            });


            window.tdmediaAllItems = photoItems;
			layoutRows(photoItems);
			status.textContent = `${photoItems.length} images loaded.`;
		} catch (err) {
			console.error('[TDMEDIA] Error loading media:', err);
			status.textContent = 'Error loading media.';
		} finally {
            hideLoading();
        }

        setupSearchInput(photoItems);
        
	}


    // new search feature
    function setupSearchInput(photoItemsRef) {
        const input = document.getElementById('tdmedia-search');
        if (!input) {
            console.warn('[TDMEDIA] Search input not found, skipping setup.');
            return;
        }

        console.log('[TDMEDIA] Search input found. Wiring up live search handler…');

        let searchTimeout = null;

        input.addEventListener('input', () => {
            const rawValue = input.value;
            console.log(`[TDMEDIA] Search typed: "${rawValue}"`);

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const query = rawValue.trim().toLowerCase();

                if (query.length < 3) {
                    console.log('[TDMEDIA] Search input < 3 characters, restoring full grid');
                    layoutRows(photoItemsRef); // Show all
                    return;
                }

                console.log(`[TDMEDIA] Running search for: "${query}"`);

                const filtered = photoItemsRef.filter(item => {
                    const fields = [
                        item?.title?.rendered || '',
                        item?.caption || '',
                        item?.alt_text || '',
                        item?.description || ''
                    ];

                    const match = fields.some(field =>
                        field.toLowerCase().includes(query)
                    );

                    if (match) {
                        console.log(`[TDMEDIA] Match found in item ID ${item.id}:`, fields);
                    }

                    return match;
                });

                console.log(`[TDMEDIA] Found ${filtered.length} matches for "${query}"`);
                layoutRows(filtered);
            }, 300);
        });
    }



	function layoutRows(items) {
		grid.innerHTML = '';
		const containerWidth = grid.clientWidth;
		const targetHeight = 400;
		const gap = 16;

		let row = [];
		let rowAspectSum = 0;

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const aspect = item.width / item.height;

			row.push(item);
			rowAspectSum += aspect;

			const rowHeight = (containerWidth - (row.length - 1) * gap) / rowAspectSum;

			if (rowHeight < targetHeight || i === items.length - 1) {
				renderRow(row, rowHeight < targetHeight ? rowHeight : targetHeight);
				row = [];
				rowAspectSum = 0;
			}
		}
	}

	function renderRow(row, height) {
		const rowEl = document.createElement('div');
		rowEl.className = 'tdmedia-row';
		rowEl.style.display = 'flex';
		rowEl.style.gap = '16px';
		rowEl.style.marginBottom = '1rem';

		for (const img of row) {
			const width = (img.width / img.height) * height;
			const wrapper = document.createElement('div');
			wrapper.className = 'tdmedia-item';
			wrapper.style.flex = `0 0 ${width}px`;

			wrapper.innerHTML = `
				<div class="tdmedia-img-wrapper" style="aspect-ratio: ${img.width} / ${img.height}">
					<img src="${img.finalUrl}" alt="${img.title.rendered || 'Image'}" loading="lazy" />
				</div>
				<div class="tdmedia-overlay">
					<div class="tdmedia-title">${img.title.rendered || '(No title)'}</div>
					<div>ID: ${img.id}</div>
					<div>Type: ${img.finalLabel} — ${img.mime_type}</div>
					<div>Size: ${img.width}×${img.height}</div>
					<div>File: ${formatBytes(img.finalSize)}</div>
					<div>Uploaded: ${formatDate(img.date)}</div>
				</div>
			`;

			wrapper.querySelector('img').addEventListener('load', e => {
				e.target.classList.add('loaded');
			});

			wrapper.addEventListener('click', () => {
                // Remove any existing modal
                const existing = document.getElementById('tdmedia-modal');
                if (existing) existing.remove();

                console.log('[TDMEDIA] Opening modal for image ID:', img.id);

                // Create modal wrapper
                const modal = document.createElement('div');
                modal.id = 'tdmedia-modal';
                modal.innerHTML = `
                    <div class="tdmedia-modal-overlay"></div>
                    <div class="tdmedia-modal-content" role="dialog" aria-modal="true">
                        <div class="tdmedia-modal-left">
                            <div class="tdmedia-modal-image">
                                <img src="${img.finalUrl}" alt="${img.title.rendered || 'Image'}" />
                            </div>
                        </div>
                        <div class="tdmedia-modal-right">
                            <h2>${img.title.rendered || '(No title)'}</h2>
                            <ul class="tdmedia-meta-list">
                                <li><strong>ID:</strong> ${img.id}</li>
                                <li><strong>Type:</strong> ${img.finalLabel} — ${img.mime_type}</li>
                                <li><strong>Size:</strong> ${img.width}×${img.height}</li>
                                <li><strong>File:</strong> ${formatBytes(img.finalSize)}</li>
                                <li><strong>Uploaded:</strong> ${formatDate(img.date)}</li>
                            </ul>
                            
                            <div class="tdmedia-actions">
                                <button type="button" id="tdmedia-copy-url">Copy Image URL</button>
                                <a id="tdmedia-download-link" href="#" download target="_blank" rel="noopener">
                                    <button type="button">Download Image</button>
                                </a>
                            </div>

                            <form id="tdmedia-meta-form">
                                <div class="tdmedia-form-group">
                                    <label for="tdmedia-alt">Alt Text</label>
                                    <input type="text" id="tdmedia-alt" name="alt_text" />
                                </div>

                                <div class="tdmedia-form-group">
                                    <label for="tdmedia-caption">Caption</label>
                                    <textarea id="tdmedia-caption" name="caption" rows="2"></textarea>
                                </div>

                                <div class="tdmedia-close-modal-wrapper">
                                    <button type="submit" id="tdmedia-save-meta">Save Metadata</button>
                                    <button id="tdmedia-close-modal" class="tdmedia-close-btn">Close</button>
                                </div>
                                
                            </form>

                            
                        </div>
                    </div>
                `;

                // Append and wire close
                document.body.appendChild(modal);

                    // Log full object to verify fields
                    console.log('[TDMEDIA] Loaded image object:', img);

                    // Pre-fill fields with metadata
                    const altInput = document.getElementById('tdmedia-alt');
                    const captionTextarea = document.getElementById('tdmedia-caption');

                    if (altInput) {
                        altInput.value = img.alt_text || '';
                        console.log('[TDMEDIA] Set alt text:', altInput.value);
                    }

                    if (captionTextarea) {
                        captionTextarea.value = img.caption || '';
                        console.log('[TDMEDIA] Set caption:', captionTextarea.value);
                    }

                    // Inside your showModal() or similar function

                    const copyBtn = document.getElementById('tdmedia-copy-url');
                    const downloadLink = document.getElementById('tdmedia-download-link');
                    const currentImageUrl = img.finalUrl;

                    // Set download href
                    downloadLink.href = currentImageUrl;

                    // Copy handler
                    copyBtn.addEventListener('click', async () => {
                        try {
                            await navigator.clipboard.writeText(currentImageUrl);
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => (copyBtn.textContent = 'Copy Image URL'), 1500);
                        } catch (err) {
                            console.error('[TDMEDIA] Failed to copy:', err);
                            copyBtn.textContent = 'Failed to copy';
                        }
                    });

                    console.log('[TDMEDIA] Looking for form fields:', document.getElementById('tdmedia-alt'), document.getElementById('tdmedia-caption'));

                    const form = document.getElementById('tdmedia-meta-form');
                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();

                        const altText = document.getElementById('tdmedia-alt').value.trim();
                        const caption = document.getElementById('tdmedia-caption').value.trim();

                        // Optional: show saving state
                        const saveBtn = document.getElementById('tdmedia-save-meta');
                        saveBtn.disabled = true;
                        saveBtn.textContent = 'Saving…';

                        try {
                            const res = await wp.apiFetch({
                                path: `/wp/v2/media/${img.id}`,
                                method: 'POST',
                                data: {
                                    alt_text: altText,
                                    caption: caption,
                                }
                            });
                            console.log('[TDMEDIA] Saved meta:', res);
                            saveBtn.textContent = 'Saved!';
                            setTimeout(() => {
                                saveBtn.disabled = false;
                                saveBtn.textContent = 'Save Changes';
                            }, 1500);
                        } catch (err) {
                            console.error('[TDMEDIA] Failed to save:', err);
                            saveBtn.textContent = 'Error';
                            saveBtn.disabled = false;
                        }
                    });


                modal.querySelector('.tdmedia-modal-overlay').addEventListener('click', () => modal.remove());
                modal.querySelector('#tdmedia-close-modal').addEventListener('click', () => modal.remove());
            });


			rowEl.appendChild(wrapper);
		}

		grid.appendChild(rowEl);
	}

	document.getElementById('tdmedia-refresh').addEventListener('click', fetchMedia);
	window.addEventListener('resize', () => {
		clearTimeout(window.__tdmedia_resize_timeout);
		window.__tdmedia_resize_timeout = setTimeout(fetchMedia, 300);
	});
	setupUploadZone(status, fetchMedia);
	fetchMedia();

})();


function setupUploadZone(status, fetchMedia) {
	const zone = document.getElementById('tdmedia-upload-zone');
	const overlay = document.getElementById('tdmedia-uploading-overlay');
	const overlayBar = document.getElementById('tdmedia-progress-bar-inner-overlay');
	const toolbarWrapper = document.getElementById('tdmedia-progress-wrapper');
	const toolbarBar = document.getElementById('tdmedia-progress-bar-inner');

	// Ensure drag events are handled only on the drop zone
	['dragenter', 'dragover'].forEach(eventName => {
		zone.addEventListener(eventName, e => {
			e.preventDefault();
			e.stopPropagation();
			zone.classList.add('drag-over');
		});
	});

	['dragleave', 'drop'].forEach(eventName => {
		zone.addEventListener(eventName, e => {
			e.preventDefault();
			e.stopPropagation();
			zone.classList.remove('drag-over');
		});
	});

	zone.addEventListener('drop', async e => {
		e.preventDefault();
		e.stopPropagation();
		const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
		if (files.length === 0) return;

		status.textContent = `Uploading ${files.length} image(s)…`;

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

		overlay.style.display = 'none';
		document.body.classList.remove('tdmedia-uploading');
		toolbarWrapper.style.display = 'none';
		status.textContent = 'Upload complete. Refreshing…';

		await fetchMedia();
	});
}




function injectTdMediaModal() {
	if (document.getElementById('tdmedia-modal')) return; // Prevent duplicate

	const modal = document.createElement('div');
	modal.id = 'tdmedia-modal';
	modal.className = 'tdmedia-modal';
	modal.style.display = 'none';
	modal.innerHTML = `
		<div class="tdmedia-modal-overlay"></div>
		<div class="tdmedia-modal-content">
			<div class="tdmedia-modal-image">
				<img id="tdmedia-modal-img" src="" alt="" />
			</div>
			<div class="tdmedia-modal-form-placeholder">
				<p style="opacity: 0.6;">(Form fields will go here)</p>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	// Close on overlay click
	modal.querySelector('.tdmedia-modal-overlay').addEventListener('click', () => {
		modal.style.display = 'none';
	});

	// Close on ESC key
	document.addEventListener('keydown', e => {
		if (e.key === 'Escape') {
			modal.style.display = 'none';
		}
	});
}
document.addEventListener('DOMContentLoaded', () => {
	    injectTdMediaModal();
    });