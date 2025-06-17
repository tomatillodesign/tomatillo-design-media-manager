<?php
/**
 * Plugin Name:       Tomatillo Design ~ Media Manager
 * Description:       A custom WordPress Media Library experience with improved layout, AVIF support, and modern JavaScript enhancements.
 * Version:           1.1
 * Author:            Chris Liu-Beers, Tomatillo Design
 * Plugin URI:        https://github.com/YOUR_GITHUB/tomatillo-design-media-manager
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'TDMEDIA_DIR', plugin_dir_path( __FILE__ ) );
define( 'TDMEDIA_URL', plugin_dir_url( __FILE__ ) );

// Register custom admin page
add_action( 'admin_menu', function() {
	add_media_page(
		'Media Manager',
		'Media Manager',
		'upload_files',
		'tdmedia-manager',
		'tdmedia_render_manager_page'
	);
} );

function tdmedia_render_manager_page() {
	echo '
		<div id="tdmedia-app">
			<h1>Tomatillo Media Manager</h1>

			<!-- Upload Zone -->
			<div id="tdmedia-upload-zone" class="tdmedia-upload-zone">
				<p>Drag & drop images here to upload</p>
			</div>

			<!-- Upload Overlay -->
			<div id="tdmedia-uploading-overlay" class="tdmedia-uploading-overlay" style="display: none;">
				<div class="tdmedia-uploading-inner">
					<div class="clb-tdmedia-uploading-in-progress-text-wrapper">
						<div class="tdmedia-spinner" aria-label="Uploading…"></div>
					</div>
					<div class="tdmedia-progress-bar">
						<div id="tdmedia-progress-bar-inner-overlay" class="tdmedia-progress-bar-inner"></div>
					</div>
				</div>
			</div>

			<!-- Toolbar Progress -->
			<div id="tdmedia-progress-wrapper" class="tdmedia-toolbar-progress" style="display: none;">
				<div class="tdmedia-progress-bar">
					<div id="tdmedia-progress-bar-inner" class="tdmedia-progress-bar-inner"></div>
				</div>
			</div>

			<!-- Main Grid Area -->
			<div id="tdmedia-content"></div>
		</div>';
}


// Enqueue JS/CSS
add_action( 'admin_enqueue_scripts', function( $hook ) {
	if ( $hook !== 'media_page_tdmedia-manager' ) return;

    // ✅ Loads media modal UI and Backbone views
	wp_enqueue_media();

	// ✅ Force the edit frame + attachment details modal to be registered
    wp_enqueue_script( 'media-editor' ); // ← this is the missing piece
	wp_enqueue_script( 'media-grid' ); // ← this is the missing piece
	wp_enqueue_style( 'media-views' ); // also important for layout

    wp_enqueue_script(
        'tdmedia-main-js',
        TDMEDIA_URL . 'assets/tdmedia.js',
        ['wp-element', 'wp-components', 'wp-api-fetch'],
        '1.0',
        true
    );

	wp_enqueue_style(
		'tdmedia-style',
		TDMEDIA_URL . 'assets/tdmedia.css',
		[],
		'1.0'
	);

	wp_enqueue_script( 'jszip', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', [], null, true );

	// Localized settings or nonce can be passed here later
} );
