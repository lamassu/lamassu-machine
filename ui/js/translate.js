var debug = false;

$(document).ready(function () {
	load_params();

	$("#showcase").load(function() {

		store_original();
		var interval_id = window.setInterval(save, 1000);

		var first_screen = $("#showcase").contents().find('section[data-tr-section]:first').data('tr-section');
		switch_screen(first_screen);

		var screens = $('#screens');
		$("#showcase").contents().find('section[data-tr-section]').each(function() {
			var screen_name = $(this).data('tr-section');
			screens.append('<div class="screen" data-screen="' + screen_name + '">' + 
				screen_name + '</div>');
		});
		$('#screens .screen:first').addClass('active');

		$('#translations').on('keyup', '.tr-value', function(e) {
			var row = $(this).parents('tr');
			var tr_id = row.attr('data-tr-key');
			var view_el = $("#showcase").contents();
			var val = $(this).val();
			$('#translations').data('dirty', true);
			$('#translations').data('last_pressed', window.performance.now());
			$(this).data('dirty', true);
			if (val) {
				view_el.find('*[data-tr-key=' + tr_id + ']').text($(this).val());
			} else {
				view_el.find('*[data-tr-key=' + tr_id + ']').text(row.data('original'));							
			}
		});

		$('#show-original').hover(show_original, show_translated);
		$('#screens .screen').click(switch_screen_handler);
		$('#screens .screen').hover(switch_screen_preview, revert_screen_preview);

		load_translations();
	})
});

function load_translations() {
	var api_key = $('#translations').data('api_key');
	var locale = $('#translations').data('locale');
	$.post("/translate-load.php", { api_key: api_key, locale: locale }, loaded_translations);	
}

function loaded_translations(data) {
	var translations = data.translations;
	$('#translations').data('translations', translations);
	update_loaded_translations();
	update_loaded_screen_translations();
}

function store_original() {
	var view_el = $("#showcase").contents();
	view_el.find('*[data-tr-key]').each(function() {
		$(this).data('tr-original', $(this).text());
	});
}

function update_loaded_screen_translations() {
	var translations = $('#translations').data('translations');
	var view_el = $("#showcase").contents();
	if (translations) {
		$.each(translations, function(index, v) {
			var key = v.key;
			var value = v.value;
			$('#translations tr[data-tr-key=' + key + '] .tr-value').val(value);
			view_el.find('*[data-tr-key="' + key + '"]').text(value);
		});		
	}
}

function update_loaded_translations() {
	var translations = $('#translations').data('translations');
	if (translations) {
		$.each(translations, function(index, v) {
			var key = v.key;
			var value = v.value;
			$('#translations tr[data-tr-key=' + key + '] .tr-value').val(value);
		});		
	}
}

function switch_screen_handler() {
	switch_screen($(this).data('screen'));
	$(this).addClass('active');
}

function switch_screen_preview() {
	switch_screen_display($(this).data('screen'));
}

function revert_screen_preview() {
	switch_screen_display(current_view());
}

function switch_screen_display(new_view) {
	var showcase = $("#showcase").contents();
	showcase.find('section[data-tr-section]').hide();
	var view = showcase.find('section[data-tr-section="' + new_view + '"]');
	view.show();	
}

function switch_screen(new_view) {
	$('#translations').data('current-view', new_view);
	$('#screens .screen').removeClass('active');
	switch_screen_display(new_view);
	update_translations(new_view);
}

function current_view() {
	return $('#translations').data('current-view');
}

function update_translations(new_view) {
	var showcase = $("#showcase").contents();
	var view = showcase.find('section[data-tr-section="' + new_view + '"]');
	$('#translations tbody').empty();
	view.find('*[data-tr-key]').each(function() {
		if (!$(this).data('tr-dup')) {
			var original = $(this).data('tr-original');
			$('#translations tbody').append('<tr data-tr-key="' + $(this).attr("data-tr-key") + 
				'" data-original="' + original + '"><td class="original">' + 
				original + '</td><td><input type="text" class="tr-value" /></td></tr>');			
		}
	});
	update_loaded_translations();
}

function load_params() {
	var uri = new URI(window.location.href);
	var params = uri.search(true);
	$('#translations').data('api_key', params['api']);	
	$('#translations').data('locale', params['locale']);	
}

function save() {
	var last_pressed = $('#translations').data('last_pressed');
	var waited = !last_pressed || ((window.performance.now() - last_pressed) > 1000);
	if ($('#translations').data('dirty') && waited) {
		$('#translations').data('dirty', false);
		$('.tr-value').each(function() {
			if ($(this).data('dirty')) {
				var row = $(this).parents('tr');
				var tr_id = row.data('tr-key');
				var value = $(this).val();
				$(this).data('dirty', false);
				if (debug) {
					window.setTimeout(function() { saved(tr_id); }, 800);
				} else {
					var api_key = $('#translations').data('api_key');
					var locale = $('#translations').data('locale');
					$.post("/translate-save.php", { api_key: api_key, locale: locale, key: tr_id, value: value }, function() { saved(tr_id) });
				}
			}
		});
	}
}

function saved(tr_id) {
	var row = $('#translations tr[data-tr-key=' + tr_id + ']');
	var original = row.find('td.original');
	original.html('<span class="saved">saved.</span>');
	window.setTimeout(function() { original.text(row.data('original')); }, 2000);	
}

function show_original() {
	var view_el = $("#showcase").contents().find('section[data-tr-section="' + current_view() + '"]');
	view_el.find('*[data-tr-key]').each(function() {
		var tr_id = $(this).attr('data-tr-key');
		var row = $('#translations tr[data-tr-key=' + tr_id + ']');
		$(this).text(row.data('original'));
	});
}

function show_translated() {
	var view_el = $("#showcase").contents().find('section[data-tr-section="' + current_view() + '"]');
	view_el.find('*[data-tr-key]').each(function() {
		var tr_id = $(this).attr('data-tr-key');
		var row = $('#translations tr[data-tr-key=' + tr_id + ']');
		var value = row.find('.tr-value').val();
		$(this).text(value || row.data('original'));
	});
}