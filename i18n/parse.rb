# coding: UTF-8
require 'nokogiri'
require 'json'

puts %{#. extracted from Lamassu source code
msgid ""
msgstr ""
"Project-Id-Version: 50\\n"
"Report-Msgid-Bugs-To: \\n"
"POT-Creation-Date: 2013-10-31 15:34-0400\\n"
"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n"
"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"
"Language-Team: LANGUAGE <LL@li.org>\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"X-Generator: Lamassu PO Builder\\n"

}

# Do app.js manually for now
app_js = {
	'wifi-connecting' => [
			'This could take a few moments.',
			'Connected. Waiting for ticker.',
			{ :string => "You're connecting to the WiFi network %s", :comments => [ '%s is the WiFi network name' ] }
	],
	'wifi-password' => [
			{ :string => 'for %s', :comments => [ '%s is the WiFi network name', 'example: for HomeNetwork' ] }
	],
	'idle' => [
		{ :string => 'Our current Bitcoin price is %s',
			:comments => [ '%s is the Bitcoin price', 'example: Our current Bitcoin price is $123.45' ] },
		'Loading Bitcoin price...',
		{ :string => 'LanguageName',
			:comments => ['The name of the language you\'re translating.', 'e.g., français, español'] }
	],
	'insert-bills' => [
		{ :string => 'per %s inserted',
			:comments => ['example: per $1 inserted']}
	],
	'insert-more-bills' => [
		{ :string => 'You inserted a %s bill',
			:comments => [ '%s is the bill denomination', 'example: You inserted a $5 bill' ] },
		"We're out of bitcoins.",
		"Please touch <strong>Send Bitcoins</strong> to complete your purchase.",
		'Transaction limit reached.', 'We\'re out of bitcoins.'
	],
	'high-bill' => [
		{ :string => 'Please insert %s or less.',
			:comments => [ '%s is a bill denomination', 'example: Please insert $10 or less' ] },
		'Transaction limit reached.', 'We\'re a little low.'
	],
	'wifi' => [
		{ :string => 'MORE', :comments => [] }
	],
	'choose-fiat' => [
		{ :string => 'You\'ll be sending %s mBTC',
			:comments => [ '%s is amount of Bitcoins that user is sending'] }
	]
}


def write_po(str, screen, translations, comments = [])
	if translations[str] then return end
	translations[str] = true
	quoted = str.inspect
	comments.each do |comment|
		puts %{\#. #{comment}}
	end
	puts %{\#: On screen: #{screen}}
	puts %{msgid #{quoted}}
	puts %{msgstr #{quoted}}
	puts
end

translations = {}
screens = {}
doc = Nokogiri::HTML(open('../ui/start.html'));

doc.css('.viewport').each do |node|
	screen = node.attr('data-tr-section')
	next if !screen
	if !screens[screen]
		screens[screen] = true
		app_strings = app_js[screen]
		if app_strings
			app_strings.each do |as|
				if as.is_a? String
					write_po(as, screen, translations)
				else
					write_po(as[:string], screen, translations, as[:comments])
				end
			end
		end
		node.css('input[placeholder]').each do |placeholder|
			str = placeholder.attr('placeholder')
			write_po(str, screen, translations)
		end
	end
end

doc.css('.js-i18n').each do |node|
	screen_node = node.ancestors('.viewport').first
	screen = screen_node.attr('data-tr-section')
	str = node.inner_html.strip.gsub(/\s+/, ' ')
	write_po(str, screen, translations)
end
