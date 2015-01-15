require('json')

locales = []
rec = {}

Dir.glob(File.join('build', '*', 'ui', '*.po')).each {|f|
	lines = IO.readlines(f)

	last_key = nil
	json = {}
	locale = nil
	lines.each do |line|
		if line =~ /^"Language: (\w+)\\n"/
			locale = $1.tr('_', '-')
		end
		if line =~ /^msgid\s+(.*)$/
			last_key = JSON.parse(%|{"r": #{$1}}|)['r']
			next if last_key.size == 0
		end
		if line =~ /^msgstr\s+(.*)$/
			next unless last_key.size > 0
			val = JSON.parse(%|{"r": #{$1}}|)['r']
			json[last_key] = [nil, val]
		end
	end

	json[''] = {'domain' => 'messages', 'lang' => locale}
	rec[locale] = json
}

File.write('../ui/js/locales.js', 'var locales = ' + JSON.dump(rec) + ';')
