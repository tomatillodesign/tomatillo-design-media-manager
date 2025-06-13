(function () {
	console.log('[TDMEDIA] Booting Masonry Mode...');

	// Utility: Format bytes into KB or MB for display
	function formatBytes(bytes) {
		if (!bytes || bytes === 0) return '—';
		const units = ['B', 'KB', 'MB'];
		let i = Math.floor(Math.log(bytes) / Math.log(1024));
		let size = (bytes / Math.pow(1024, i)).toFixed(0);
		return `${size} ${units[i]}`;
	}

	// Main app container
	const app = document.getElementById('tdmedia-app');
	if (!app) {
		console.warn('[TDMEDIA] No #tdmedia-app container found.');
		return;
	}

	// Render initial UI layout: toolbar and empty grid
	app.innerHTML = `
		<div class="tdmedia-toolbar">
			<button id="tdmedia-refresh">🔄 Refresh</button>
			<span id="tdmedia-status">Ready.</span>
		</div>
		<div id="tdmedia-grid" class="tdmedia-grid"></div>
	`;

	const grid = document.getElementById('tdmedia-grid');
	const status = document.getElementById('tdmedia-status');

	// Load images from WP REST API and render them into the grid
	async function fetchMedia() {
		status.textContent = 'Loading media...';
		grid.innerHTML = '';

		try {
			// Step 1: Get basic info for media items (limited fields for speed)
			const response = await wp.apiFetch({
				path: '/wp/v2/media?per_page=50&_fields=id,title,source_url,media_type,mime_type,media_details'
			});

			// Step 2: Filter down to image types only
			const images = response.filter(item => item.mime_type.startsWith('image/'));

			// Step 3: Loop through each image and render it
			for (const item of images) {
				const { id, source_url, title, mime_type, media_details } = item;

				// Step 4: Get full metadata for each image (to get AVIF/WebP info)
				const meta = await wp.apiFetch({ path: `/wp/v2/media/${id}` });

                console.log(meta);

				// Extract potential high-performance image versions
				// Extract custom media URLs and their sizes (sizes stored in KB)
                const avifUrl = meta.meta?._avif_url || null;
                const avifSizeKb = parseInt(meta.meta?._avif_size_kb || 0, 10);

                const webpUrl = meta.meta?._webp_url || null;
                const webpSizeKb = parseInt(meta.meta?._webp_size_kb || 0, 10);

                // Scaled size is still assumed to be in BYTES unless otherwise noted
                const scaledSizeBytes = parseInt(meta.meta?._scaled_size || 0, 10);

				// Default to original source and data
				let finalUrl = source_url;
                let finalLabel = 'Original';
                let finalSizeBytes = media_details.filesize || 0;

                if (avifUrl && avifSizeKb > 0) {
                    finalUrl = avifUrl;
                    finalLabel = 'AVIF';
                    finalSizeBytes = avifSizeKb * 1024;
                } else if (webpUrl && webpSizeKb > 0) {
                    finalUrl = webpUrl;
                    finalLabel = 'WebP';
                    finalSizeBytes = webpSizeKb * 1024;
                } else if (scaledSizeBytes > 0) {
                    finalLabel = 'Scaled JPG';
                    finalSizeBytes = scaledSizeBytes;
                }


				// Step 8: Create the visual element for the image
				const el = document.createElement('div');
				el.className = 'tdmedia-item';
				el.innerHTML = `
					<img src="${source_url}" alt="${title.rendered || 'Image'}" loading="lazy" />
					<div class="tdmedia-overlay">
						<div class="tdmedia-title">${title.rendered || '(No title)'}</div>
						<div>ID: ${id}</div>
						<div>Type: ${finalLabel} — ${mime_type}</div>
						<div>Size: ${media_details.width}×${media_details.height}</div>
						<div>File: ${formatBytes(finalSizeBytes)}</div>
					</div>
				`;

				// Step 9: Optional click handler for modal/editing (placeholder)
				el.addEventListener('click', () => {
                    const frame = wp.media({
                        frame: 'select',
                        title: 'Edit Media Item',
                        button: { text: 'Close' },
                        multiple: false,
                        library: {
                            type: 'image'
                        }
                    });

                    frame.on('open', () => {
                        const selection = frame.state().get('selection');
                        const attachment = wp.media.attachment(id);
                        attachment.fetch();
                        selection.add(attachment);
                    });

                    frame.open();
                });


				grid.appendChild(el);
			}

			status.textContent = `${images.length} images loaded.`;
		} catch (err) {
			console.error('[TDMEDIA] Error loading media:', err);
			status.textContent = 'Error loading media.';
		}
	}

	// Trigger refresh when the button is clicked
	document.getElementById('tdmedia-refresh').addEventListener('click', fetchMedia);

	// Load on first run
	fetchMedia();
})();
