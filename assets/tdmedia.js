(function () {
	console.log('[TDMEDIA] Booting Colcade layout…');

	// Format bytes into readable file sizes
	function formatBytes(bytes) {
		if (!bytes) return '—';
		const units = ['B','KB','MB'];
		const i = Math.floor(Math.log(bytes)/Math.log(1024));
		return `${(bytes/1024**i).toFixed(0)} ${units[i]}`;
	}

    function formatDate(dateString) {
        const d = new Date(dateString);
        return d.toLocaleDateString('en-US', {
            month: 'short', // 'Jun'
            day: 'numeric', // '13'
            year: 'numeric' // '2024'
        });
    }

	// Set up the UI shell
	const app = document.getElementById('tdmedia-app');
	if (!app) return;

	app.innerHTML = `
		<div class="tdmedia-toolbar">
			<button id="tdmedia-refresh">🔄 Refresh</button>
			<span id="tdmedia-status">Ready.</span>
		</div>
		<div id="tdmedia-grid" class="tdmedia-grid">
			<div class="tdmedia-col"></div>
			<div class="tdmedia-col"></div>
			<div class="tdmedia-col"></div>
			<div class="tdmedia-col"></div>
		</div>
	`;

	const grid = document.getElementById('tdmedia-grid');
	const status = document.getElementById('tdmedia-status');
	const columns = grid.querySelectorAll('.tdmedia-col');
	let colcade;

	function appendToNextColumn(el, index) {
		const targetCol = columns[index % columns.length];
		targetCol.appendChild(el);
	}

	async function fetchMedia() {
		status.textContent = 'Loading media…';
		columns.forEach(col => col.innerHTML = '');

		try {
			const response = await wp.apiFetch({
                path: '/wp/v2/media?per_page=100&orderby=date&order=desc&_fields=id,title,source_url,media_type,mime_type,media_details,date'
            });
			const images = response.filter(item => item.mime_type.startsWith('image/'));

			let index = 0;

			for (const item of images) {
				const { id, source_url, title, mime_type, media_details, date } = item;
				const meta = await wp.apiFetch({ path: `/wp/v2/media/${id}` });

				// Get AVIF/WebP info
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
						<img src="${source_url}" alt="${title.rendered || 'Image'}" loading="lazy" />
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

				const img = el.querySelector('img');
				img.addEventListener('load', () => {
					img.classList.add('loaded');
				});

				// Modal edit on click
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

				appendToNextColumn(el, index);
				index++;
			}

			if (!colcade) {
				colcade = new Colcade(grid, {
					columns: '.tdmedia-col',
					items: '.tdmedia-item'
				});
			} else {
				colcade.relayout();
			}

			status.textContent = `${images.length} images loaded.`;
		} catch (err) {
			console.error('[TDMEDIA] Error loading media:', err);
			status.textContent = 'Error loading media.';
		}
	}

	document.getElementById('tdmedia-refresh').addEventListener('click', fetchMedia);
	fetchMedia();
})();
