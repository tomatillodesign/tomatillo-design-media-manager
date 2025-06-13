(function () {
	console.log('[TDMEDIA] Booting Flex Row Layout…');

	// Format bytes to readable string
	function formatBytes(bytes) {
		if (!bytes) return '—';
		const units = ['B', 'KB', 'MB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / 1024 ** i).toFixed(0)} ${units[i]}`;
	}

	// Format date as 'Jun 13, 2024'
	function formatDate(dateString) {
		const d = new Date(dateString);
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	}

	// Setup layout
	const app = document.getElementById('tdmedia-app');
	if (!app) return;

	app.innerHTML = `
		<div class="tdmedia-toolbar">
			<button id="tdmedia-refresh">Refresh</button>
			<span id="tdmedia-status">Ready.</span>
		</div>
		<div id="tdmedia-upload-zone" class="tdmedia-upload-zone">
			Drag & drop images here to upload
		</div>
		<div id="tdmedia-grid" class="tdmedia-flex-grid"></div>
	`;

	const grid = document.getElementById('tdmedia-grid');
	const status = document.getElementById('tdmedia-status');

	async function fetchMedia() {
		status.textContent = 'Loading media…';
		grid.innerHTML = '';

		try {
			const response = await wp.apiFetch({
				path: '/wp/v2/media?per_page=100&orderby=date&order=desc&_fields=id,title,source_url,media_type,mime_type,media_details,date'
			});

			const images = response.filter(item => item.mime_type?.startsWith('image/'));
			for (const item of images) {
				const { id, source_url, title, mime_type, media_details, date } = item;
				const meta = await wp.apiFetch({ path: `/wp/v2/media/${id}` });

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

				const el = document.createElement('div');
				el.className = 'tdmedia-item';
				el.innerHTML = `
					<div class="tdmedia-img-wrapper" style="aspect-ratio: ${media_details.width} / ${media_details.height}">
						<img src="${finalUrl}" alt="${title.rendered || 'Image'}" loading="lazy" />
					</div>
					<div class="tdmedia-overlay">
						<div class="tdmedia-title">${title.rendered || '(No title)'}</div>
						<div>ID: ${id}</div>
						<div>Type: ${finalLabel} — ${mime_type}</div>
						<div>Size: ${media_details.width}×${media_details.height}</div>
						<div>File: ${formatBytes(finalSize)}</div>
						<div>Uploaded: ${formatDate(date)}</div>
					</div>
				`;

				el.querySelector('img').addEventListener('load', e => {
                    e.target.classList.add('loaded');
                });

				el.addEventListener('click', () => {
					const frame = wp.media({
						frame: 'select',
						title: 'Edit Media Item',
						button: { text: 'Close' },
						multiple: false,
						library: { type: 'image' }
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

	document.getElementById('tdmedia-refresh').addEventListener('click', fetchMedia);
	window.addEventListener('resize', () => {
		grid.style.gap = '1rem'; // Trigger reflow
	});
	setupUploadZone();
	fetchMedia();
})();



// Upload zone handler
function setupUploadZone(status) {
	const zone = document.getElementById('tdmedia-upload-zone');

	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		zone.addEventListener(eventName, e => {
			e.preventDefault();
			e.stopPropagation();
		});
	});

	['dragenter', 'dragover'].forEach(eventName => {
		zone.addEventListener(eventName, () => zone.classList.add('drag-over'));
	});
	['dragleave', 'drop'].forEach(eventName => {
		zone.addEventListener(eventName, () => zone.classList.remove('drag-over'));
	});

	zone.addEventListener('drop', async e => {
		const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));

		if (files.length === 0) {
			console.warn('[TDMEDIA] No valid image files dropped.');
			return;
		}

		status.textContent = `Uploading ${files.length} image(s)…`;

		for (const file of files) {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('title', file.name);

			try {
				const result = await wp.apiFetch({
					path: '/wp/v2/media',
					method: 'POST',
					body: formData,
					headers: {
						'Content-Disposition': `attachment; filename="${file.name}"`
					}
				});
				console.log('[TDMEDIA] Uploaded:', result);
			} catch (err) {
				console.error('[TDMEDIA] Upload error:', err);
			}
		}

		status.textContent = 'Upload complete. Refreshing…';
		await fetchMedia();
	});
}
