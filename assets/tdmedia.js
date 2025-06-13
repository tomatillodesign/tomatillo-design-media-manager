(function () {
	console.log('[TDMEDIA] Booting Justified Row Masonry Layout…');

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
		<div id="tdmedia-grid"></div>
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

			const photoItems = [];

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

				photoItems.push({
					id, title, mime_type, finalUrl, finalLabel, finalSize, date,
					width: media_details.width,
					height: media_details.height
				});
			}

			layoutRows(photoItems);
			status.textContent = `${photoItems.length} images loaded.`;
		} catch (err) {
			console.error('[TDMEDIA] Error loading media:', err);
			status.textContent = 'Error loading media.';
		}
	}

	function layoutRows(items) {
		grid.innerHTML = '';
		const containerWidth = grid.clientWidth;
		const targetHeight = 400;
		const gap = 10;

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
		rowEl.style.gap = '10px';
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
				const frame = wp.media({
					frame: 'select',
					title: 'Edit Media Item',
					button: { text: 'Close' },
					multiple: false,
					library: { type: 'image' }
				});
				frame.on('open', () => {
					const selection = frame.state().get('selection');
					const attachment = wp.media.attachment(img.id);
					attachment.fetch();
					selection.add(attachment);
				});
				frame.open();
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
	setupUploadZone(status);
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
